import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';

import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';

import { formatCode } from '../utils/codeFormatter.js';

import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { trackEvent, ALLOWED_EVENTS } from '../utils/analytics.js';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Play,
  Send,
  Clock,
  Terminal,
  RotateCcw,
  ArrowRight,
  Code2,
  Sparkles,
  Check,
  ChevronDown,
} from 'lucide-react';
import DsaCoach from '../components/DsaCoach';

const DEFAULT_BOILERPLATES = {
  javascript: 'function solve() {\n  // Your code here\n}',
  python: 'def solve():\n    pass',
  java: 'class Solution {\n    public void solve() {\n        // Your code here\n    }\n}',
  cpp: 'class Solution {\npublic:\n    void solve() {\n        // Your code here\n    }\n};',
};

const myEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#0a101d',
    color: '#e2e8f0',
    height: '100%',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#38bdf8',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#38bdf8',
  },
  '.cm-content': {
    caretColor: '#38bdf8',
  },
  '.cm-gutters': {
    backgroundColor: '#070b14',
    color: '#64748b',
    borderRight: '1px solid #1a283e',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
});

const SUPPORTED_LANGUAGES = ['javascript', 'python', 'java', 'cpp'];

function getBoilerplate(problem, language) {
  return (
    problem?.boilerplates?.[language] ||
    DEFAULT_BOILERPLATES[language] ||
    DEFAULT_BOILERPLATES.javascript
  );
}

// Identifies the old generic starter templates that may have been
// saved under the wrong language by an earlier version of DSA Arena.
function isGenericStarterCode(code) {
  if (typeof code !== 'string') return true;

  return (
    code.includes("console.log('Hello, PrepAI!')") ||
    code.trim() === 'function solve() {\n // Your code here\n console.log(\'Hello, PrepAI!\');\n}' ||
    code.trim() === 'function solve() {\n  // Your code here\n}'
  );
}

const DsaArena = () => {
  const { getToken, isLoggedIn, userId } = useAuth();
  const { openLogin } = useModal();
  const [codeByLanguage, setCodeByLanguage] = useState({});
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('prepai_default_language');
    return SUPPORTED_LANGUAGES.includes(saved) ? saved : 'javascript';
  });
  const [code, setCode] = useState(() => {
    const saved = localStorage.getItem('prepai_default_language');
    const lang = SUPPORTED_LANGUAGES.includes(saved) ? saved : 'javascript';
    return DEFAULT_BOILERPLATES[lang] || DEFAULT_BOILERPLATES.javascript;
  });
  const [langExtension, setLangExtension] = useState(() => {
    const saved = localStorage.getItem('prepai_default_language');
    const lang = SUPPORTED_LANGUAGES.includes(saved) ? saved : 'javascript';
    switch (lang) {
      case 'python': return python();
      case 'java': return java();
      case 'cpp': return cpp();
      default: return javascript({ jsx: true });
    }
  });

  const [problem, setProblem] = useState(null);
  const [topic, setTopic] = useState('Arrays');
  const [difficulty, setDifficulty] = useState('Easy');
  const [activeProblemTab, setActiveProblemTab] = useState('problem'); // 'problem' | 'examples' | 'constraints'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [feedback, setFeedback] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [evaluationError, setEvaluationError] = useState(null);
  const [runResults, setRunResults] = useState(null);
  const [executionResults, setExecutionResults] = useState(null);
  const [selectedTestCaseIndex, setSelectedTestCaseIndex] = useState(0);
  const [activeResultsTab, setActiveResultsTab] = useState('tests');
  const [resetSessionCount, setResetSessionCount] = useState(0);
  const [hasGivenUp, setHasGivenUp] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [pendingProblemLoad, setPendingProblemLoad] = useState(null);
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatFeedback, setFormatFeedback] = useState(null);
  const lastSubmittedCodeRef = useRef(null);
  const isMountedRef = useRef(true);
  const editorViewRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleGiveUp = useCallback(() => {
    setHasGivenUp(true);
  }, []);

  const dsaStorageKey = userId ? `prepai:${userId}:dsa` : null;

  // Track the problem and language for which boilerplate has been initialized
  const initializedProblemRef = useRef({ problemKey: null, language: null });

  // Keep a ref to the latest state so saveDsaState does not depend on `code` or recreate on every keystroke
  const latestStateRef = useRef({});
  latestStateRef.current = {
    problem,
    code,
    language,
    topic,
    difficulty,
    feedback,
    runResults,
    executionResults,
    evaluationError,
    codeByLanguage,
  };

  // Restore saved DSA state.
  useEffect(() => {
    if (!dsaStorageKey) return;

    try {
      const savedState = localStorage.getItem(dsaStorageKey);
      if (!savedState) return;

      const parsedState = JSON.parse(savedState);
      const savedLanguage = SUPPORTED_LANGUAGES.includes(parsedState.language)
        ? parsedState.language
        : 'javascript';

      const savedProblem = parsedState.problem ?? null;
      let restoredProblem = savedProblem;
      if (restoredProblem) {
        const problemId =
          restoredProblem.id ||
          restoredProblem.problemId ||
          restoredProblem._id;
        if (problemId) {
          restoredProblem = {
            ...restoredProblem,
            id: problemId,
            problemId,
          };
        }
      }
      const restoredCodeByLanguage = parsedState.codeByLanguage || {};
      setCodeByLanguage(restoredCodeByLanguage);
      const savedCode = parsedState.code;
      const hasSavedCode = typeof savedCode === 'string';

      const shouldReplaceStarter =
        !hasSavedCode ||
        (savedLanguage !== 'javascript' &&
          isGenericStarterCode(savedCode));

      const languageSavedCode = restoredCodeByLanguage[savedLanguage];

      const codeToRestore =
        typeof languageSavedCode === 'string'
          ? languageSavedCode
          : shouldReplaceStarter
            ? getBoilerplate(restoredProblem, savedLanguage)
            : savedCode;

      setLanguage(savedLanguage);
      setProblem(restoredProblem);
      setCode(codeToRestore);
      // Mark this problem and language as already initialized with user/restored code
      initializedProblemRef.current = {
        problemKey: restoredProblem
          ? (restoredProblem.id || restoredProblem.problemId || restoredProblem.title)
          : null,
        language: savedLanguage,
      };

      if (parsedState.topic !== undefined) {
        setTopic(parsedState.topic);
      }

      if (parsedState.difficulty !== undefined) {
        setDifficulty(parsedState.difficulty);
      }

      if (parsedState.feedback !== undefined) {
        setFeedback(parsedState.feedback);
      }

      if (parsedState.runResults !== undefined) {
        setRunResults(parsedState.runResults);
      }

      if (parsedState.executionResults !== undefined) {
        setExecutionResults(parsedState.executionResults);
        if (parsedState.executionResults && hasSavedCode) {
          lastSubmittedCodeRef.current = codeToRestore;
        }
      }

      if (parsedState.evaluationError !== undefined) {
        setEvaluationError(parsedState.evaluationError);
      }

      console.log('DSA state restored from localStorage.');
    } catch (error) {
      console.error('Failed to restore DSA Arena state:', error);
    }
  }, [dsaStorageKey]);

  // Save the complete DSA state.
  // Reads from latestStateRef so it does not depend on `code` or recreate on typing.
  const saveDsaState = useCallback(
    (overrides = {}) => {
      if (!dsaStorageKey) return;

      try {
        const current = latestStateRef.current;
        const stateToSave = {
          problem: overrides.problem !== undefined ? overrides.problem : current.problem,
          code: overrides.code !== undefined ? overrides.code : current.code,
          codeByLanguage:
            overrides.codeByLanguage !== undefined
              ? overrides.codeByLanguage
              : current.codeByLanguage,
          language:
            overrides.language !== undefined ? overrides.language : current.language,
          topic: overrides.topic !== undefined ? overrides.topic : current.topic,
          difficulty:
            overrides.difficulty !== undefined
              ? overrides.difficulty
              : current.difficulty,
          feedback:
            overrides.feedback !== undefined ? overrides.feedback : current.feedback,
          runResults:
            overrides.runResults !== undefined ? overrides.runResults : current.runResults,
          executionResults:
            overrides.executionResults !== undefined
              ? overrides.executionResults
              : current.executionResults,
          evaluationError:
            overrides.evaluationError !== undefined
              ? overrides.evaluationError
              : current.evaluationError,
        };

        localStorage.setItem(dsaStorageKey, JSON.stringify(stateToSave));
      } catch (error) {
        console.error('Failed to save DSA Arena state:', error);
      }
    },
    [dsaStorageKey]
  );

  // Update CodeMirror syntax highlighting.
  useEffect(() => {
    switch (language) {
      case 'javascript':
        setLangExtension(javascript({ jsx: true }));
        break;
      case 'cpp':
        setLangExtension(cpp());
        break;
      case 'java':
        setLangExtension(java());
        break;
      case 'python':
        setLangExtension(python());
        break;
      default:
        setLangExtension(javascript({ jsx: true }));
    }
  }, [language]);

  // Load the correct boilerplate for a newly generated problem.
  // Preserves existing code if the problem and language are already initialized or restored.
  useEffect(() => {
    if (!problem) return;

    const problemKey = problem.id || problem.title;

    // Do nothing if this exact problem and language have already been initialized
    if (
      initializedProblemRef.current.problemKey === problemKey &&
      initializedProblemRef.current.language === language
    ) {
      return;
    }

    // Preserve saved work from localStorage if the stored problem and language match
    if (dsaStorageKey) {
      try {
        const savedState = localStorage.getItem(dsaStorageKey);

        if (savedState) {
          const parsedState = JSON.parse(savedState);

          const isSameProblem =
            parsedState.problem?.title === problem.title ||
            (problem.id && parsedState.problem?.id === problem.id);

          const savedLanguageCode = parsedState.codeByLanguage?.[language];

          if (
            isSameProblem &&
            typeof savedLanguageCode === 'string'
          ) {
            setCodeByLanguage(parsedState.codeByLanguage);
            setCode(savedLanguageCode);

            initializedProblemRef.current = {
              problemKey,
              language,
            };

            return;
          }
        }
      } catch (error) {
        console.error('Failed to check saved DSA state:', error);
      }
    }

    const boilerplate = getBoilerplate(problem, language);

    setCode(boilerplate);
    setCodeByLanguage((prev) => ({ ...prev, [language]: boilerplate }));
    initializedProblemRef.current = {
      problemKey,
      language,
    };

    saveDsaState({
      problem,
      code: boilerplate,
      codeByLanguage: {
        ...(latestStateRef.current.codeByLanguage || {}),
        [language]: boilerplate,
      },
      language,
    });
  }, [problem, language, dsaStorageKey, saveDsaState]);

  // Reset current session: completely clears the active problem, returns arena to empty state,
  // resets editor code to default boilerplate, clears results/errors, and clears persisted session.
  const handleResetSession = useCallback(() => {
    setEvaluationError(null);
    setRunResults(null);
    setExecutionResults(null);
    setFeedback(null);
    setActiveResultsTab('tests');
    setSelectedTestCaseIndex(0);
    setHasGivenUp(false);
    setProblem(null);
    lastSubmittedCodeRef.current = null;
    setPendingProblemLoad(null);

    const savedDefault = localStorage.getItem('prepai_default_language');
    const resetLang = SUPPORTED_LANGUAGES.includes(savedDefault) ? savedDefault : 'javascript';
    setLanguage(resetLang);
    const defaultCode = DEFAULT_BOILERPLATES[resetLang] || DEFAULT_BOILERPLATES.javascript;
    setCode(defaultCode);
    setCodeByLanguage({});

    initializedProblemRef.current = {
      problemKey: null,
      language: null,
    };

    if (dsaStorageKey) {
      try {
        localStorage.removeItem(dsaStorageKey);
      } catch (err) {
        console.error('Failed to remove DSA state on reset:', err);
      }
    }

    setResetSessionCount((count) => count + 1);
    setHintsUsed(0);
  }, [language, dsaStorageKey]);

  // Apply a newly loaded problem into state
  const applyLoadProblem = useCallback(
    (newProblem, newTopic, newDifficulty) => {
      if (!newProblem) return false;

      const problemId =
        newProblem?.id ||
        newProblem?.problemId ||
        newProblem?._id ||
        (newProblem?.title
          ? newProblem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
          : undefined);

      const targetTopic = newTopic || newProblem.topic || topic;
      const targetDifficulty = newDifficulty || newProblem.difficulty || difficulty;
      const stableProblem = {
        ...newProblem,
        id: problemId,
        problemId,
        difficulty: targetDifficulty,
        topic: targetTopic,
      };

      const boilerplate = getBoilerplate(stableProblem, language);

      setTopic(targetTopic);
      setDifficulty(targetDifficulty);
      setProblem(stableProblem);
      setHintsUsed(0);
      setCode(boilerplate);
      setCodeByLanguage({ [language]: boilerplate });
      setRunResults(null);
      setExecutionResults(null);
      setEvaluationError(null);
      setFeedback(null);
      setActiveResultsTab('tests');
      setSelectedTestCaseIndex(0);
      setHasGivenUp(false);
      lastSubmittedCodeRef.current = null;

      initializedProblemRef.current = {
        problemKey: problemId || stableProblem.title,
        language,
      };

      saveDsaState({
        problem: stableProblem,
        code: boilerplate,
        codeByLanguage: { [language]: boilerplate },
        language,
        topic: targetTopic,
        difficulty: targetDifficulty,
        feedback: null,
        runResults: null,
        executionResults: null,
        evaluationError: null,
      });

      return true;
    },
    [language, topic, difficulty, saveDsaState]
  );

  // Load a generated problem (e.g. from Pepe AI Coach tool invocation)
  const handleLoadProblem = useCallback(
    (newProblem, newTopic, newDifficulty) => {
      if (!newProblem) return false;

      // Check if user has genuinely unsaved code modifications
      if (problem && code) {
        const currentBoilerplate = getBoilerplate(problem, language);
        const isBoilerplate = code.trim() === currentBoilerplate.trim();
        const isAccepted = executionResults?.verdict === 'Accepted';
        const isAlreadySubmitted =
          executionResults &&
          lastSubmittedCodeRef.current &&
          code.trim() === lastSubmittedCodeRef.current.trim();
        const isKnownBroken =
          problem.title === 'Peak Segment Product' || problem.isInvalid;

        // Code is genuinely unsaved only if user modified it, it has not been accepted,
        // it has not been submitted in its current state, and the problem is not known broken.
        const hasUnsavedModifications =
          !isBoilerplate && !isAccepted && !isAlreadySubmitted && !isKnownBroken;

        if (hasUnsavedModifications) {
          setPendingProblemLoad({ newProblem, newTopic, newDifficulty });
          return false;
        }
      }

      return applyLoadProblem(newProblem, newTopic, newDifficulty);
    },
    [problem, code, language, executionResults, applyLoadProblem]
  );

  // Clear all saved coach and DSA data
  const handleClearAllCoachData = useCallback(() => {
    if (dsaStorageKey) {
      localStorage.removeItem(dsaStorageKey);
    }
    setProblem(null);
    setCode('');
    setCodeByLanguage({});
    setRunResults(null);
    setExecutionResults(null);
    setEvaluationError(null);
    setFeedback(null);
    setError(null);
    setActiveResultsTab('tests');
    setSelectedTestCaseIndex(0);
    setHasGivenUp(false);
    initializedProblemRef.current = { problemKey: null, language: null };
  }, [dsaStorageKey]);

  // Execute actual problem generation call without prematurely wiping existing state
  const executeGenerateProblem = async () => {
    if (isLoading) return;
    setError(null);
    setIsLoading(true);

    try {
      const token = isLoggedIn ? await getToken() : null;

      const config = token
        ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
        : {};

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/generate-problem`,
        { topic, difficulty, excludeTitle: problem?.title },
        config
      );

      const generatedProblem = response.data;
      if (generatedProblem) {
        if (isMountedRef.current) {
          applyLoadProblem(
            generatedProblem,
            generatedProblem.topic || topic,
            generatedProblem.difficulty || difficulty
          );
        } else if (dsaStorageKey) {
          // If unmounted while generating, save the problem directly to localStorage
          // so when the user returns to DSA Arena, the problem is ready and restored
          try {
            const current = latestStateRef.current || {};
            const stateToSave = {
              ...current,
              problem: generatedProblem,
              topic: generatedProblem.topic || topic,
              difficulty: generatedProblem.difficulty || difficulty,
              code: getBoilerplate(generatedProblem, language),
              feedback: null,
              runResults: null,
              executionResults: null,
              evaluationError: null,
            };
            localStorage.setItem(dsaStorageKey, JSON.stringify(stateToSave));
          } catch {}
        }
        trackEvent(ALLOWED_EVENTS.DSA_PROBLEM_GENERATED, {
          topic: generatedProblem.topic || topic,
          difficulty: generatedProblem.difficulty || difficulty,
        });
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err.response?.data?.error
          ? err.response.data.error
          : 'An unexpected error occurred.';

        setError(errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Generate a new problem with unsaved-code guard.
  const generateProblem = async () => {
    if (isLoading) return;
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    // Check if user has genuinely unsaved code modifications
    if (problem && code) {
      const currentBoilerplate = getBoilerplate(problem, language);
      const isBoilerplate = code.trim() === currentBoilerplate.trim();
      const isAccepted = executionResults?.verdict === 'Accepted';
      const isAlreadySubmitted =
        executionResults &&
        lastSubmittedCodeRef.current &&
        code.trim() === lastSubmittedCodeRef.current.trim();
      const isKnownBroken =
        problem.title === 'Peak Segment Product' || problem.isInvalid;

      const hasUnsavedModifications =
        !isBoilerplate && !isAccepted && !isAlreadySubmitted && !isKnownBroken;

      if (hasUnsavedModifications) {
        setPendingProblemLoad({ isManualGenerate: true });
        return;
      }
    }

    await executeGenerateProblem();
  };

  // Update and persist editor contents.
  const onChange = useCallback(
    (value) => {
      setCode(value);

      setCodeByLanguage((previous) => {
        const next = {
          ...previous,
          [language]: value,
        };
        saveDsaState({
          code: value,
          codeByLanguage: next,
        });
        return next;
      });
    },
    [language, saveDsaState]
  );

  // Change language and load the corresponding starter code.
  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;

    if (!SUPPORTED_LANGUAGES.includes(newLanguage)) return;

    const updatedCodeByLanguage = {
      ...codeByLanguage,
      [language]: code,
    };

    const newCode =
      updatedCodeByLanguage[newLanguage] ??
      getBoilerplate(problem, newLanguage);

    const finalCodeByLanguage = {
      ...updatedCodeByLanguage,
      [newLanguage]: newCode,
    };

    setLanguage(newLanguage);
    setCode(newCode);
    setCodeByLanguage(finalCodeByLanguage);
    setFeedback(null);
    setRunResults(null);
    setExecutionResults(null);
    setEvaluationError(null);

    initializedProblemRef.current = {
      problemKey: problem ? (problem.id || problem.title) : null,
      language: newLanguage,
    };

    saveDsaState({
      language: newLanguage,
      code: newCode,
      codeByLanguage: finalCodeByLanguage,
      feedback: null,
      runResults: null,
      executionResults: null,
      evaluationError: null,
    });
  };

  // Run code against visible / sample test cases ONLY.
  const handleRunCode = async () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    if (!problem) {
      setEvaluationError('Please generate a problem first.');
      return;
    }

    setEvaluationError(null);
    setIsRunningCode(true);
    setRunResults(null);
    setExecutionResults(null);
    setFeedback(null);
    setActiveResultsTab('tests');
    setSelectedTestCaseIndex(0);

    saveDsaState({
      runResults: null,
      executionResults: null,
      feedback: null,
      evaluationError: null,
    });

    try {
      const token = await getToken();

      if (!token) {
        setEvaluationError('Your session is not ready. Please try again.');
        return;
      }

      const problemId = problem?.id || problem?.problemId || problem?._id;
      const problemPayload = {
        ...problem,
        id: problemId,
        problemId,
      };

      console.log(`[DSA Arena Dev] Running code for problem ID: ${problemId}`);

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/run-code`,
        {
          problem: problemPayload,
          problemId,
          code,
          language,
          topic,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setRunResults(response.data);
      saveDsaState({ runResults: response.data, executionResults: null, evaluationError: null });
    } catch (err) {
      const errorMessage = err.response?.data?.error
        ? err.response.data.error
        : 'An unexpected error occurred while running code.';

      setRunResults(null);
      setExecutionResults(null);
      setFeedback(null);
      setEvaluationError(errorMessage);
      saveDsaState({
        runResults: null,
        executionResults: null,
        feedback: null,
        evaluationError: errorMessage,
      });
    } finally {
      setIsRunningCode(false);
    }
  };

  // Submit code for full evaluation against visible and hidden test cases.
  const handleCodeSubmission = async () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    if (!problem) {
      setEvaluationError('Please generate a problem first.');
      return;
    }

    setEvaluationError(null);
    setIsEvaluating(true);
    setRunResults(null);
    setExecutionResults(null);
    setFeedback(null);
    setActiveResultsTab('tests');
    setSelectedTestCaseIndex(0);

    saveDsaState({
      runResults: null,
      executionResults: null,
      feedback: null,
      evaluationError: null,
    });

    try {
      const token = await getToken();

      if (!token) {
        setEvaluationError('Your session is not ready. Please try again.');
        return;
      }

      const problemId = problem?.id || problem?.problemId || problem?._id;
      const problemPayload = {
        ...problem,
        id: problemId,
        problemId,
      };

      console.log(`[DSA Arena Dev] Submitting code for evaluation on problem ID: ${problemId}`);

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/evaluate-code`,
        {
          problem: problemPayload,
          problemId,
          code,
          language,
          topic,
          difficulty: problemPayload.difficulty || difficulty,
          hintsUsed,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = response.data;
      setExecutionResults(data);
      lastSubmittedCodeRef.current = code;

      trackEvent(ALLOWED_EVENTS.DSA_SUBMISSION_COMPLETED, {
        language,
        topic,
        difficulty: problemPayload.difficulty || difficulty,
        verdict: data?.verdict || 'Unknown',
        passed_tests_count: Number(data?.passedTests) || 0,
        total_tests_count: Number(data?.totalTests) || 0,
      });

      const aiFeedback = data.feedback || {
        correctness: data.correctness,
        timeComplexity: data.timeComplexity,
        spaceComplexity: data.spaceComplexity,
        optimization: data.optimization,
      };

      setFeedback(aiFeedback);

      saveDsaState({
        runResults: null,
        executionResults: data,
        feedback: aiFeedback,
        evaluationError: null,
      });

      // Record activity after a successful submission.
      axios
        .post(
          `${import.meta.env.VITE_API_URL}/api/user/record-activity`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
        .catch((err) => {
          console.error('Failed to record activity:', err);
        });
    } catch (err) {
      const errorMessage = err.response?.data?.error
        ? err.response.data.error
        : 'An unexpected error occurred.';

      setRunResults(null);
      setExecutionResults(null);
      setFeedback(null);
      setEvaluationError(errorMessage);
      saveDsaState({
        runResults: null,
        executionResults: null,
        feedback: null,
        evaluationError: errorMessage,
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  // Format code across all supported languages (JavaScript, Python, Java, C++)
  const handleFormatCode = useCallback(async () => {
    if (!code || isFormatting) return;
    setIsFormatting(true);
    setFormatFeedback(null);

    try {
      const view = editorViewRef.current;
      const prevSelection = view ? view.state.selection.main : null;

      const result = await formatCode(code, language);

      if (!result.success) {
        setFormatFeedback({ type: 'warning', message: result.error });
        console.warn(`[Format Code] ${result.error}`);
        return;
      }

      const formattedCode = result.formatted;
      if (formattedCode === code) {
        setFormatFeedback({ type: 'info', message: 'Already formatted' });
        return;
      }

      setCode(formattedCode);

      const updatedCodeByLanguage = {
        ...codeByLanguage,
        [language]: formattedCode,
      };

      setCodeByLanguage(updatedCodeByLanguage);

      saveDsaState({
        code: formattedCode,
        codeByLanguage: updatedCodeByLanguage,
      });

      setFormatFeedback({ type: 'success', message: 'Formatted' });

      // Restore cursor position if view is mounted
      if (view && prevSelection) {
        setTimeout(() => {
          try {
            const safeAnchor = Math.min(prevSelection.anchor, formattedCode.length);
            const safeHead = Math.min(prevSelection.head, formattedCode.length);
            view.dispatch({
              selection: { anchor: safeAnchor, head: safeHead },
              scrollIntoView: false,
            });
          } catch {}
        }, 0);
      }
    } catch (error) {
      console.error('Failed to format code:', error);
      setFormatFeedback({ type: 'error', message: 'Failed to format' });
    } finally {
      setIsFormatting(false);
      setTimeout(() => setFormatFeedback(null), 3500);
    }
  }, [code, language, codeByLanguage, isFormatting, saveDsaState]);

  // Keyboard shortcut listener for formatting (Shift+Alt+F / Alt+Shift+F)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.shiftKey && e.altKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        handleFormatCode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFormatCode]);

  // Close the results panel.
  const closeFeedbackPanel = () => {
    setFeedback(null);
    setRunResults(null);
    setExecutionResults(null);
    setEvaluationError(null);

    saveDsaState({
      feedback: null,
      runResults: null,
      executionResults: null,
      evaluationError: null,
    });
  };

  // Determine feedback status.
  const getFeedbackStatus = () => {
    if (!feedback) return null;

    const text = (feedback.correctness || '').toLowerCase();

    if (
      text.includes('incorrect') ||
      text.includes('error') ||
      text.includes('not correct') ||
      text.includes('incomplete')
    ) {
      return {
        type: 'error',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        icon: <AlertCircle className="text-red-400" />,
      };
    }

    if (text.includes('correct') || text.includes('optimal')) {
      return {
        type: 'success',
        color: 'text-green-400',
        bg: 'bg-green-500/10',
        border: 'border-green-500/20',
        icon: <CheckCircle className="text-green-400" />,
      };
    }

    return {
      type: 'warning',
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      icon: <AlertTriangle className="text-yellow-400" />,
    };
  };

  const getVerdictBadge = (verdict) => {
    switch (verdict) {
      case 'Accepted':
        return {
          color: 'text-green-400',
          bg: 'bg-green-500/10',
          border: 'border-green-500/20',
          icon: <CheckCircle className="text-green-400 w-5 h-5 flex-shrink-0" />,
        };
      case 'Wrong Answer':
        return {
          color: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/20',
          icon: <AlertCircle className="text-red-400 w-5 h-5 flex-shrink-0" />,
        };
      case 'Time Limit Exceeded':
        return {
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20',
          icon: <Clock className="text-amber-400 w-5 h-5 flex-shrink-0" />,
        };
      case 'Compilation Error':
        return {
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20',
          icon: <AlertTriangle className="text-amber-400 w-5 h-5 flex-shrink-0" />,
        };
      case 'Runtime Error':
      default:
        return {
          color: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/20',
          icon: <AlertCircle className="text-red-400 w-5 h-5 flex-shrink-0" />,
        };
    }
  };

  const status = getFeedbackStatus();
  const currentExecution =
    isRunningCode || isEvaluating ? null : (executionResults || runResults);

  return (
    <div className="flex flex-col flex-1 h-full">
      <DsaCoach
        activeProblem={problem}
        code={code}
        language={language}
        runResults={runResults}
        executionResults={executionResults}
        evaluationError={evaluationError}
        onResetSession={handleResetSession}
        onClearAllCoachData={handleClearAllCoachData}
        onLoadProblem={handleLoadProblem}
        resetTrigger={resetSessionCount}
        hasGivenUp={hasGivenUp}
        onGiveUp={handleGiveUp}
        onHintLevelChange={setHintsUsed}
      />

      {/* Styled Unsaved Changes Confirmation Modal */}
      {pendingProblemLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-xl border border-amber-500/30 bg-surface p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <AlertTriangle size={18} className="shrink-0 text-amber-400" />
              Unsaved Code Modifications
            </h3>
            <p className="mt-2 text-xs text-text-secondary leading-relaxed">
              You have modified code for the current problem that has not been submitted. Loading a new problem will reset your editor. Do you want to proceed?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingProblemLoad(null)}
                className="flex-1 rounded-lg border border-text-secondary/20 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-text-secondary/10 transition"
              >
                Keep Working
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = pendingProblemLoad;
                  setPendingProblemLoad(null);
                  if (pending?.isManualGenerate) {
                    executeGenerateProblem();
                  } else if (pending?.newProblem) {
                    applyLoadProblem(pending.newProblem, pending.newTopic, pending.newDifficulty);
                  }
                }}
                className="flex-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition"
              >
                Load New Problem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header matching reference mockup */}
      <header className="mb-4 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
          <Code2 size={14} />
          <span>DSA Arena</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">DSA Arena</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Practice coding challenges, run your solutions, and get immediate feedback.
        </p>
      </header>

      {/* Top Selector Control Bar with Prominent Generate Problem Button */}
      <div className="p-3.5 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/70 flex flex-wrap items-center justify-between gap-3 mb-5 shrink-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Topic Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="topic" className="text-xs text-text-secondary font-medium">Topic</label>
            <div className="relative inline-flex items-center">
              <select
                id="topic"
                value={topic}
                onChange={(event) => {
                  const newTopic = event.target.value;
                  setTopic(newTopic);
                  saveDsaState({ topic: newTopic });
                }}
                className="appearance-none bg-surface-elevated/80 dark:bg-[#0e1319]/90 border border-border/80 dark:border-white/10 text-text-primary text-xs rounded-xl pl-3 pr-8 py-1.5 hover:border-emerald-500/40 focus:border-emerald-500/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition cursor-pointer"
              >
                <option value="Any" className="bg-[#0e1319] text-text-primary">(Any)</option>
                <option className="bg-[#0e1319] text-text-primary">Arrays</option>
                <option className="bg-[#0e1319] text-text-primary">Strings</option>
                <option className="bg-[#0e1319] text-text-primary">Hash Map</option>
                <option className="bg-[#0e1319] text-text-primary">Two Pointers</option>
                <option className="bg-[#0e1319] text-text-primary">Binary Search</option>
                <option className="bg-[#0e1319] text-text-primary">Stack</option>
                <option className="bg-[#0e1319] text-text-primary">Intervals</option>
                <option className="bg-[#0e1319] text-text-primary">Trees</option>
                <option className="bg-[#0e1319] text-text-primary">Graphs</option>
                <option className="bg-[#0e1319] text-text-primary">Dynamic Programming</option>
                <option className="bg-[#0e1319] text-text-primary">Linked List</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 text-text-secondary/70" />
            </div>
          </div>

          {/* Difficulty Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="difficulty" className="text-xs text-text-secondary font-medium">Difficulty</label>
            <div className="relative inline-flex items-center">
              <select
                id="difficulty"
                value={difficulty}
                onChange={(event) => {
                  const newDifficulty = event.target.value;
                  setDifficulty(newDifficulty);
                  saveDsaState({ difficulty: newDifficulty });
                }}
                className="appearance-none bg-surface-elevated/80 dark:bg-[#0e1319]/90 border border-border/80 dark:border-white/10 text-text-primary text-xs rounded-xl pl-3 pr-8 py-1.5 hover:border-emerald-500/40 focus:border-emerald-500/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition cursor-pointer"
              >
                <option value="Any" className="bg-[#0e1319] text-text-primary">(Any)</option>
                <option className="bg-[#0e1319] text-text-primary">Easy</option>
                <option className="bg-[#0e1319] text-text-primary">Medium</option>
                <option className="bg-[#0e1319] text-text-primary">Hard</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 text-text-secondary/70" />
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="language" className="text-xs text-text-secondary font-medium">Language</label>
            <div className="relative inline-flex items-center">
              <select
                id="language"
                value={language}
                onChange={handleLanguageChange}
                className="appearance-none bg-surface-elevated/80 dark:bg-[#0e1319]/90 border border-border/80 dark:border-white/10 text-text-primary text-xs rounded-xl pl-3 pr-8 py-1.5 hover:border-emerald-500/40 focus:border-emerald-500/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition cursor-pointer"
              >
                <option value="javascript" className="bg-[#0e1319] text-text-primary">JavaScript</option>
                <option value="python" className="bg-[#0e1319] text-text-primary">Python</option>
                <option value="java" className="bg-[#0e1319] text-text-primary">Java</option>
                <option value="cpp" className="bg-[#0e1319] text-text-primary">C++</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 text-text-secondary/70" />
            </div>
          </div>
        </div>

        {/* Generate Problem Button */}
        <button
          onClick={generateProblem}
          disabled={isLoading}
          type="button"
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isLoading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <span>Generate Problem</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row gap-5 overflow-visible lg:overflow-hidden pb-20 lg:pb-0">
        {/* Problem Details Panel (Left) */}
        <div className="lg:w-2/5 flex flex-col bg-surface/70 backdrop-blur-md rounded-2xl border border-border/70 overflow-hidden shadow-lg min-h-[320px] lg:min-h-0">
          {/* Problem Tabs Header matching reference mockup */}
          <div className="flex items-center gap-1 p-2 bg-surface-elevated/40 border-b border-border/40 shrink-0">
            <button
              type="button"
              onClick={() => setActiveProblemTab('problem')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeProblemTab === 'problem'
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Problem
            </button>
            <button
              type="button"
              onClick={() => setActiveProblemTab('examples')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeProblemTab === 'examples'
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Examples
            </button>
            <button
              type="button"
              onClick={() => setActiveProblemTab('constraints')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeProblemTab === 'constraints'
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Constraints
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 text-text-secondary space-y-4">
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs text-text-primary font-medium">Generating a challenge for {topic} ({difficulty})...</p>
              </div>
            )}

            {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">Error: {error}</div>}

            {!problem && !isLoading && !error && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-text-secondary">
                <Code2 size={32} className="text-emerald-400/60 mb-3" />
                <p className="text-xs font-medium text-text-primary">Ready to practice DSA</p>
                <p className="text-[11px] text-text-muted mt-1 max-w-xs">
                  Select a topic and difficulty above, then click "Generate Problem" to start solving.
                </p>
              </div>
            )}

            {problem && (
              <div>
                {(problem.isInvalid || problem.title === 'Peak Segment Product') && (
                  <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={15} className="shrink-0 text-amber-400" />
                      <span>This challenge was flagged for inconsistent test cases. You can generate another problem.</span>
                    </div>
                  </div>
                )}

                {/* Title & Badges matching reference mockup */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-lg font-bold text-text-primary tracking-tight">
                    {problem.title}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-surface-elevated border border-border text-text-secondary">
                    {problem.topic || topic}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    {problem.difficulty || difficulty}
                  </span>
                  {problem.isFallback && (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400"
                      title={problem.fallbackReason || 'Loaded from verified problem library'}
                    >
                      Verified Blueprint
                    </span>
                  )}
                </div>

                {/* TAB 1: PROBLEM DESCRIPTION */}
                {activeProblemTab === 'problem' && (
                  <div className="space-y-4 text-xs leading-relaxed text-text-primary/90">
                    <p className="whitespace-pre-wrap">
                      {problem.description}
                    </p>

                    {Array.isArray(problem.constraints) && problem.constraints.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border/40">
                        <h4 className="font-bold text-text-primary mb-2 text-xs">
                          Constraints:
                        </h4>
                        <ul className="list-disc pl-5 space-y-1 text-text-secondary font-mono text-[11px]">
                          {problem.constraints.map((constraint, index) => (
                            <li key={index}>{constraint}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: EXAMPLES */}
                {activeProblemTab === 'examples' && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-text-primary text-xs">
                      Example Test Cases:
                    </h4>
                    {(problem.examples || []).map((example, index) => (
                      <div
                        key={index}
                        className="bg-surface-elevated/40 border border-border/50 p-3 rounded-xl text-xs space-y-1.5"
                      >
                        <div className="font-semibold text-emerald-400 text-[11px]">
                          Example {index + 1}
                        </div>
                        <div>
                          <strong className="text-text-secondary font-medium">Input:</strong>{' '}
                          <code className="text-emerald-400 font-mono text-[11px] bg-background/50 px-1.5 py-0.5 rounded">
                            {typeof example.input === 'string'
                              ? example.input
                              : JSON.stringify(example.input)}
                          </code>
                        </div>
                        <div>
                          <strong className="text-text-secondary font-medium">Output:</strong>{' '}
                          <code className="text-emerald-400 font-mono text-[11px] bg-background/50 px-1.5 py-0.5 rounded">
                            {typeof example.output === 'string'
                              ? example.output
                              : JSON.stringify(example.output)}
                          </code>
                        </div>
                        {example.explanation && (
                          <p className="text-[11px] text-text-muted italic pt-1">
                            {example.explanation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 3: CONSTRAINTS */}
                {activeProblemTab === 'constraints' && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-text-primary text-xs">
                      Problem Constraints & Boundaries:
                    </h4>
                    {Array.isArray(problem.constraints) && problem.constraints.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1 text-text-secondary font-mono text-xs">
                        {problem.constraints.map((constraint, index) => (
                          <li key={index}>{constraint}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-muted">Standard algorithmic time and memory limits apply.</p>
                    )}
                  </div>
                )}

                {/* Sample Test Cases Preview if available */}
                {Array.isArray(problem.testCases) &&
                  problem.testCases.some((tc) => !tc.isHidden) && (
                    <div className="mt-5 border-t border-border/40 pt-4">
                      <h4 className="font-semibold text-text-primary mb-2 flex items-center justify-between text-xs">
                        <span>Sample Test Cases</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated border border-border text-text-secondary">
                          {problem.testCases.filter((tc) => !tc.isHidden).length} visible
                        </span>
                      </h4>

                      <div className="space-y-2">
                        {problem.testCases
                          .filter((tc) => !tc.isHidden)
                          .map((testCase, index) => (
                            <div
                              key={testCase.id ?? index}
                              className="bg-surface-elevated/40 p-2.5 rounded-xl border border-border/50 text-[11px] font-mono space-y-1"
                            >
                              <div>
                                <span className="text-text-secondary font-sans font-medium">Input: </span>
                                <span className="text-text-primary">
                                  {typeof testCase.input === 'object'
                                    ? JSON.stringify(testCase.input)
                                    : String(testCase.input)}
                                </span>
                              </div>
                              <div>
                                <span className="text-text-secondary font-sans font-medium">Expected Output: </span>
                                <span className="text-emerald-400">
                                  {typeof testCase.expectedOutput === 'object'
                                    ? JSON.stringify(testCase.expectedOutput)
                                    : String(testCase.expectedOutput)}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Editor and Feedback Panel (Right) */}
        <div className="lg:w-3/5 flex flex-col gap-5 overflow-visible lg:overflow-hidden">
          <div className="flex-1 flex flex-col bg-surface/70 backdrop-blur-md rounded-2xl border border-border/70 overflow-hidden shadow-lg">
            {/* Editor Top Bar matching reference mockup */}
            <div className="bg-surface-elevated/40 px-4 py-2.5 border-b border-border/40 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text-primary capitalize font-mono">
                  {language}
                </span>
                <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface border border-border">
                  Editor
                </span>
              </div>

              <div className="flex items-center gap-2">
                {formatFeedback && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono transition ${
                      formatFeedback.type === 'error'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : formatFeedback.type === 'warning'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {formatFeedback.message}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleFormatCode}
                  disabled={isFormatting || !code}
                  title="Format Code (Shift+Alt+F)"
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3c-1.2 0-2.4 0.6-3 1.7A3.6 3.6 0 0 0 8.3 9c0 2.3 1.9 3.5 3.7 3.5s3.7-1.2 3.7-3.5A3.6 3.6 0 0 0 15 4.7c-.6-1.1-1.8-1.7-3-1.7Z" />
                    <path d="M12 14v8" />
                    <path d="M5 14h14" />
                  </svg>
                </button>
              </div>
            </div>

            {/* CodeMirror Code Workspace */}
            <div className="flex-1 overflow-y-auto min-h-[280px] sm:min-h-[340px]">
              <CodeMirror
                value={code}
                height="100%"
                theme={myEditorTheme}
                extensions={[langExtension]}
                onCreateEditor={(view) => {
                  editorViewRef.current = view;
                }}
                onChange={onChange}
                style={{ fontSize: '14px' }}
              />
            </div>

            {/* Bottom Actions Bar: [▶ Run] [✓ Clear] [Submit] matching reference mockup */}
            <div className="p-3 bg-surface-elevated/40 border-t border-border/40 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetSession}
                  disabled={isRunningCode || isEvaluating || (!problem && !code)}
                  title="Clear code / Reset to starter boilerplate"
                  className="text-text-secondary hover:text-text-primary text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:bg-surface transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleRunCode}
                  disabled={isRunningCode || isEvaluating || !problem}
                  className="bg-surface-elevated border border-border hover:border-emerald-500/40 text-text-primary font-semibold text-xs py-2 px-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isRunningCode ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                      <span>Run</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCodeSubmission}
                  disabled={isEvaluating || isRunningCode || !problem}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                >
                  {isEvaluating ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Evaluating...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {(isRunningCode || isEvaluating || evaluationError || currentExecution || feedback) && (
            <div className="flex-1 flex flex-col bg-surface/70 p-4 rounded-lg border border-text-secondary/20 overflow-hidden">
              <div className="flex justify-between items-center mb-4 border-b border-text-secondary/20 pb-2 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-accent">
                    {runResults && !executionResults ? 'Run Code Results' : 'Submission & AI Review'}
                  </h2>
                  {currentExecution && (
                    <span className="text-xs px-2 py-0.5 rounded bg-surface border border-text-secondary/20 text-text-secondary">
                      {runResults && !executionResults ? 'Sample Cases Only' : 'All Test Cases'}
                    </span>
                  )}
                </div>

                <button
                  onClick={closeFeedbackPanel}
                  className="text-text-secondary hover:text-text-primary"
                  title="Close panel"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 text-text-secondary space-y-4">
                {isRunningCode && (
                  <div className="flex items-center gap-3 py-6 justify-center text-text-primary">
                    <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span>Running solution against sample test cases...</span>
                  </div>
                )}

                {isEvaluating && (
                  <div className="flex items-center gap-3 py-6 justify-center text-text-primary">
                    <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span>Evaluating solution against all test cases & analyzing code...</span>
                  </div>
                )}

                {evaluationError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-2 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>{evaluationError}</div>
                  </div>
                )}

                {/* Execution Verdict & Summary Banner */}
                {currentExecution && (
                  <div className="space-y-3">
                    {(() => {
                      const verdictInfo = getVerdictBadge(currentExecution.verdict);
                      return (
                        <div
                          className={`flex items-center justify-between p-3 rounded-lg border ${verdictInfo.bg} ${verdictInfo.border}`}
                        >
                          <div className="flex items-center gap-3">
                            {verdictInfo.icon}
                            <div>
                              <h3 className={`font-bold text-base ${verdictInfo.color}`}>
                                {currentExecution.verdict}
                              </h3>
                              <p className="text-xs text-text-primary">
                                {currentExecution.passed} / {currentExecution.total}{' '}
                                {runResults && !executionResults ? 'sample' : ''} test cases passed
                              </p>
                            </div>
                          </div>

                          {currentExecution.executionTime && (
                            <div className="flex items-center gap-1.5 text-xs text-text-secondary bg-background/50 px-2.5 py-1 rounded">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{currentExecution.executionTime}s</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Navigation tabs if both test cases and feedback are available */}
                    {feedback && (
                      <div className="flex border-b border-text-secondary/20 gap-2">
                        <button
                          onClick={() => setActiveResultsTab('tests')}
                          className={`pb-2 px-3 text-sm font-semibold border-b-2 transition-colors ${activeResultsTab === 'tests'
                            ? 'border-accent text-accent'
                            : 'border-transparent text-text-secondary hover:text-text-primary'
                            }`}
                        >
                          Test Cases ({currentExecution.passed}/{currentExecution.total})
                        </button>
                        <button
                          onClick={() => setActiveResultsTab('ai')}
                          className={`pb-2 px-3 text-sm font-semibold border-b-2 transition-colors ${activeResultsTab === 'ai'
                            ? 'border-accent text-accent'
                            : 'border-transparent text-text-secondary hover:text-text-primary'
                            }`}
                        >
                          AI Coach Review
                        </button>
                      </div>
                    )}

                    {/* Test Results View */}
                    {activeResultsTab === 'tests' && Array.isArray(currentExecution.testResults) && (
                      <div className="space-y-3">
                        {/* Test case selector pills */}
                        <div className="flex flex-wrap gap-2">
                          {currentExecution.testResults.map((tc, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedTestCaseIndex(idx)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${selectedTestCaseIndex === idx
                                ? 'bg-accent text-white shadow-sm'
                                : 'bg-background hover:bg-surface text-text-secondary border border-text-secondary/20'
                                }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full ${tc.passed ? 'bg-green-400' : 'bg-red-400'
                                  }`}
                              />
                              <span>
                                {tc.isHidden ? `Hidden Case ${idx + 1}` : `Case ${idx + 1}`}
                              </span>
                            </button>
                          ))}
                        </div>

                        {/* Selected test case detail */}
                        {(() => {
                          const selectedCase =
                            currentExecution.testResults[selectedTestCaseIndex] ||
                            currentExecution.testResults[0];

                          if (!selectedCase) return null;

                          return (
                            <div className="bg-background/80 rounded-lg p-3.5 border border-text-secondary/20 space-y-3 font-mono text-xs">
                              <div className="flex items-center justify-between pb-2 border-b border-text-secondary/20 font-sans">
                                <div className="font-bold text-sm text-text-primary flex items-center gap-2">
                                  <span>
                                    {selectedCase.isHidden
                                      ? `Hidden Test Case ${selectedTestCaseIndex + 1}`
                                      : `Test Case ${selectedTestCaseIndex + 1}`}
                                  </span>
                                  {selectedCase.isHidden && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-surface border border-text-secondary/20 text-text-secondary font-normal">
                                      Hidden
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={`font-semibold px-2 py-0.5 rounded text-xs ${selectedCase.passed
                                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}
                                >
                                  {selectedCase.passed ? 'Passed' : 'Failed'}
                                </div>
                              </div>

                              {selectedCase.isHidden ? (
                                <div className="font-sans text-text-secondary text-xs p-3 bg-surface/50 rounded border border-text-secondary/20">
                                  <p>
                                    🔒 <strong>Hidden Test Case:</strong> Inputs and expected outputs are
                                    protected to evaluate edge cases fairly and uphold interview standards.
                                  </p>
                                  {selectedCase.runtimeError && (
                                    <div className="mt-2 text-red-400 font-mono text-xs">
                                      Error: {selectedCase.runtimeError}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-2.5">
                                  <div>
                                    <div className="font-sans text-text-secondary font-medium mb-1">
                                      Input:
                                    </div>
                                    <div className="p-2 bg-surface rounded text-text-primary overflow-auto max-h-40 whitespace-pre-wrap break-words">
                                      {typeof selectedCase.input === 'object' &&
                                        Array.isArray(selectedCase.input.nums)
                                        ? `nums = [${selectedCase.input.nums.join(', ')}]`
                                        : typeof selectedCase.input === 'object'
                                          ? JSON.stringify(selectedCase.input)
                                          : String(selectedCase.input)}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="font-sans text-text-secondary font-medium mb-1">
                                      Expected Output:
                                    </div>
                                    <div className="p-2 bg-surface rounded text-green-400 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                                      {typeof selectedCase.expected === 'object'
                                        ? JSON.stringify(selectedCase.expected)
                                        : String(selectedCase.expected)}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="font-sans text-text-secondary font-medium mb-1">
                                      Actual Output:
                                    </div>
                                    <div
                                      className={`p-2 bg-surface rounded overflow-auto max-h-40 whitespace-pre-wrap break-words ${selectedCase.passed ? 'text-green-400' : 'text-red-400'
                                        }`}
                                    >
                                      {selectedCase.actual !== null &&
                                        selectedCase.actual !== undefined
                                        ? typeof selectedCase.actual === 'object'
                                          ? JSON.stringify(selectedCase.actual)
                                          : String(selectedCase.actual)
                                        : 'null (no return value)'}
                                    </div>
                                  </div>

                                  {selectedCase.runtimeError && (
                                    <div>
                                      <div className="font-sans text-red-400 font-medium mb-1">
                                        Runtime Error:
                                      </div>
                                      <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 overflow-x-auto whitespace-pre-wrap">
                                        {selectedCase.runtimeError}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* AI Review View */}
                {((activeResultsTab === 'ai' && feedback) || (!currentExecution && feedback)) && (
                  <div className="space-y-4">
                    {status && (
                      <div
                        className={`flex items-start gap-3 p-3 rounded-lg border ${status.bg} ${status.border}`}
                      >
                        <div className="mt-0.5">{status.icon}</div>

                        <div>
                          <h4 className={`font-bold ${status.color} mb-1`}>
                            {status.type === 'success'
                              ? 'Solution Correct'
                              : status.type === 'error'
                                ? 'Solution Incorrect'
                                : 'Review Needed'}
                          </h4>

                          <p className="text-sm text-text-primary">
                            {feedback.correctness}
                          </p>
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="font-semibold text-text-primary mb-1">
                        Time Complexity
                      </h4>
                      <p className="text-sm">{feedback.timeComplexity}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-text-primary mb-1">
                        Space Complexity
                      </h4>
                      <p className="text-sm">{feedback.spaceComplexity}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-text-primary mb-1">
                        Optimization
                      </h4>
                      <p className="text-sm">{feedback.optimization}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DsaArena;

