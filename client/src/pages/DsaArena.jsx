import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';

import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';

import prettier from 'prettier/standalone';
import babel from 'prettier/plugins/babel';
import estree from 'prettier/plugins/estree';

import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Play,
  Send,
  Clock,
  Terminal,
  RotateCcw,
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
    backgroundColor: '#18181b',
    color: '#e4e4e7',
    height: '100%',
  },
  '.cm-gutters': {
    backgroundColor: '#18181b',
    color: '#71717a',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: '#27272a',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#27272a',
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
  const [code, setCode] = useState(DEFAULT_BOILERPLATES.javascript);
  const [language, setLanguage] = useState('javascript');
  const [langExtension, setLangExtension] = useState(javascript({ jsx: true }));

  const [problem, setProblem] = useState(null);
  const [topic, setTopic] = useState('Arrays');
  const [difficulty, setDifficulty] = useState('Easy');
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

    const defaultCode = DEFAULT_BOILERPLATES[language] || DEFAULT_BOILERPLATES.javascript;
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

  // Load a generated problem (e.g. from Pepe AI Coach tool invocation)
  const handleLoadProblem = useCallback(
    (newProblem, newTopic, newDifficulty) => {
      if (!newProblem) return false;

      // Warn / confirm if user has unsaved code modifications
      if (problem && code) {
        const currentBoilerplate = getBoilerplate(problem, language);
        if (code.trim() !== currentBoilerplate.trim()) {
          const proceed = window.confirm(
            'You have modified code for the current problem. Loading a new problem will reset your editor. Do you want to proceed?'
          );
          if (!proceed) {
            return false;
          }
        }
      }

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
    [problem, code, language, topic, difficulty, saveDsaState]
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

  // Generate a new problem.
  const generateProblem = async () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    setError(null);
    setIsLoading(true);
    setProblem(null);
    setCode('');
    setCodeByLanguage({});
    setFeedback(null);
    setRunResults(null);
    setExecutionResults(null);
    setEvaluationError(null);
    setActiveResultsTab('tests');
    setSelectedTestCaseIndex(0);
    setHasGivenUp(false);
    initializedProblemRef.current = { problemKey: null, language: null };

    if (dsaStorageKey) {
      try {
        localStorage.removeItem(dsaStorageKey);
      } catch (error) {
        console.error('Failed to clear old DSA state:', error);
      }
    }

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
        { topic, difficulty },
        config
      );

      const generatedProblem = response.data;
      const problemId =
        generatedProblem?.id ||
        generatedProblem?.problemId ||
        generatedProblem?._id;
      const stableProblem = generatedProblem
        ? {
          ...generatedProblem,
          id: problemId,
          problemId,
        }
        : null;

      const boilerplate = getBoilerplate(stableProblem, language);

      setProblem(stableProblem);
      setCode(boilerplate);
      setCodeByLanguage({ [language]: boilerplate });
      initializedProblemRef.current = {
        problemKey: problemId || stableProblem?.title || null,
        language,
      };

      saveDsaState({
        problem: stableProblem,
        code: boilerplate,
        codeByLanguage: { [language]: boilerplate },
        language,
        topic,
        difficulty,
        feedback: null,
        runResults: null,
        executionResults: null,
        evaluationError: null,
      });
    } catch (err) {
      const errorMessage = err.response?.data?.error
        ? err.response.data.error
        : 'An unexpected error occurred.';

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
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

  // Format JavaScript using Prettier.
  const handleFormatCode = async () => {
    try {
      let parser;
      let plugins;

      switch (language) {
        case 'javascript':
          parser = 'babel';
          plugins = [babel, estree];
          break;
        default:
          console.log(`Formatting for ${language} is not yet supported.`);
          return;
      }

      const formattedCode = await prettier.format(code, {
        parser,
        plugins,
        singleQuote: true,
        trailingComma: 'es5',
      });

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
    } catch (error) {
      console.error('Failed to format code:', error);
    }
  };

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

      <header className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-bold text-text-primary">DSA Arena</h1>
        <p className="text-text-secondary">
          Select a topic, solve the problem, and get instant AI feedback.
        </p>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row gap-6 overflow-hidden">
        {/* Problem panel */}
        <div className="lg:w-2/5 flex flex-col bg-surface/70 p-4 rounded-lg border border-text-secondary/20 overflow-hidden">
          <h2 className="text-xl font-bold text-accent mb-4 border-b border-text-secondary/20 pb-2 flex-shrink-0">
            Problem
          </h2>

          <div className="space-y-4 mb-4 flex-shrink-0">
            <div>
              <label
                htmlFor="topic"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Topic
              </label>

              <select
                id="topic"
                value={topic}
                onChange={(event) => {
                  const newTopic = event.target.value;
                  setTopic(newTopic);
                  saveDsaState({ topic: newTopic });
                }}
                className="w-full bg-background text-text-primary rounded px-2 py-1 border border-text-secondary/30"
              >
                <option>Arrays</option>
                <option>Strings</option>
                <option>Linked List</option>
                <option>Trees</option>
                <option>Graphs</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="difficulty"
                className="block text-sm font-medium text-text-secondary mb-1"
              >
                Difficulty
              </label>

              <select
                id="difficulty"
                value={difficulty}
                onChange={(event) => {
                  const newDifficulty = event.target.value;
                  setDifficulty(newDifficulty);
                  saveDsaState({ difficulty: newDifficulty });
                }}
                className="w-full bg-background text-text-primary rounded px-2 py-1 border border-text-secondary/30"
              >
                <option>Easy</option>
                <option>Medium</option>
                <option>Hard</option>
              </select>
            </div>

            <button
              onClick={generateProblem}
              disabled={isLoading}
              className="w-full bg-accent text-white font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Generating...' : 'Generate Problem'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 text-text-secondary">
            {isLoading && <p>Generating a new problem...</p>}

            {error && <div className="text-red-400">Error: {error}</div>}

            {!problem && !isLoading && !error && (
              <p>
                Select a topic and difficulty, then click "Generate Problem".
              </p>
            )}

            {problem && (
              <div>
                <h3 className="text-lg font-bold text-text-primary mb-2">
                  {problem.title}
                </h3>

                <p className="whitespace-pre-wrap mb-4">
                  {problem.description}
                </p>

                {Array.isArray(problem.constraints) &&
                  problem.constraints.length > 0 && (
                    <>
                      <h4 className="font-semibold text-text-primary mb-2">
                        Constraints:
                      </h4>
                      <ul className="list-disc pl-5 mb-4 space-y-1">
                        {problem.constraints.map((constraint, index) => (
                          <li key={index}>{constraint}</li>
                        ))}
                      </ul>
                    </>
                  )}

                <h4 className="font-semibold text-text-primary mb-2">
                  Examples:
                </h4>

                {(problem.examples || []).map((example, index) => (
                  <div
                    key={index}
                    className="bg-background/50 p-2 rounded mb-2 text-sm"
                  >
                    <p>
                      <strong>Input:</strong>{' '}
                      <code className="text-accent">
                        {typeof example.input === 'string'
                          ? example.input
                          : JSON.stringify(example.input)}
                      </code>
                    </p>

                    <p>
                      <strong>Output:</strong>{' '}
                      <code className="text-accent">
                        {typeof example.output === 'string'
                          ? example.output
                          : JSON.stringify(example.output)}
                      </code>
                    </p>

                    {example.explanation && (
                      <p className="text-xs mt-1">
                        <em>{example.explanation}</em>
                      </p>
                    )}
                  </div>
                ))}

                {Array.isArray(problem.testCases) &&
                  problem.testCases.some((tc) => !tc.isHidden) && (
                    <div className="mt-4 border-t border-text-secondary/20 pt-4">
                      <h4 className="font-semibold text-text-primary mb-2 flex items-center justify-between">
                        <span>Sample Test Cases</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-surface border border-text-secondary/20 text-text-secondary">
                          {problem.testCases.filter((tc) => !tc.isHidden).length} visible
                        </span>
                      </h4>

                      <div className="space-y-2">
                        {problem.testCases
                          .filter((tc) => !tc.isHidden)
                          .map((testCase, index) => (
                            <div
                              key={testCase.id ?? index}
                              className="bg-background/60 p-2.5 rounded-lg border border-text-secondary/20 text-xs font-mono"
                            >
                              <div className="font-sans font-semibold text-accent mb-1 flex items-center justify-between">
                                <span>Sample Case {index + 1}</span>
                              </div>
                              <div className="space-y-1">
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
                                  <span className="text-green-400">
                                    {typeof testCase.expectedOutput === 'object'
                                      ? JSON.stringify(testCase.expectedOutput)
                                      : String(testCase.expectedOutput)}
                                  </span>
                                </div>
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

        {/* Editor and feedback */}
        <div className="lg:w-3/5 flex flex-col gap-6 overflow-hidden">
          <div className="flex-1 flex flex-col bg-surface/70 rounded-lg border border-text-secondary/20 overflow-hidden">
            <div className="bg-background p-2 border-b border-text-secondary/20 flex justify-between items-center">
              <h2 className="text-xl font-bold text-accent">Your Solution</h2>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleFormatCode}
                  title="Format Code"
                  className="text-text-secondary hover:text-text-primary"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
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

                <select
                  value={language}
                  onChange={handleLanguageChange}
                  className="bg-surface text-text-primary rounded px-2 py-1 border border-text-secondary/30 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <CodeMirror
                value={code}
                height="100%"
                theme={myEditorTheme}
                extensions={[langExtension]}
                onChange={onChange}
                style={{ fontSize: '16px' }}
              />
            </div>

            <div className="p-3 bg-background border-t border-text-secondary/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetSession}
                  disabled={isRunningCode || isEvaluating || (!problem && !code)}
                  title="Reset session and return Arena to clean state"
                  className="text-text-secondary hover:text-text-primary text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-text-secondary/20 hover:bg-text-secondary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Session</span>
                </button>

                {problem && !hasGivenUp && (
                  <button
                    type="button"
                    onClick={handleGiveUp}
                    disabled={isRunningCode || isEvaluating}
                    title="Give up on the current problem and reveal approach & solution"
                    className="text-text-secondary hover:text-amber-400 text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-text-secondary/20 hover:bg-amber-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Give Up</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleRunCode}
                  disabled={isRunningCode || isEvaluating || !problem}
                  className="border border-accent text-accent font-semibold py-2 px-4 rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isRunningCode ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span>Running...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Run Code</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleCodeSubmission}
                  disabled={isEvaluating || isRunningCode || !problem}
                  className="bg-accent text-white font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isEvaluating ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Evaluating...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Code</span>
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

