
import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

import CodeMirror from '@uiw/react-codemirror';
import { okaidia } from '@uiw/codemirror-theme-okaidia';
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';

import prettier from 'prettier/standalone';
import babel from 'prettier/plugins/babel';
import estree from 'prettier/plugins/estree';

import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import DsaCoach from '../components/DsaCoach';

const DEFAULT_BOILERPLATES = {
  javascript: 'function solve() {\n  // Your code here\n}',
  python: 'def solve():\n    pass',
  java: 'class Solution {\n    public void solve() {\n        // Your code here\n    }\n}',
  cpp: 'class Solution {\npublic:\n    void solve() {\n        // Your code here\n    }\n};',
};

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
  const [evaluationError, setEvaluationError] = useState(null);

  const dsaStorageKey = userId ? `prepai:${userId}:dsa` : null;

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
      const savedCode = parsedState.code;
      const hasSavedCode = typeof savedCode === 'string';

      const shouldReplaceStarter =
        !hasSavedCode ||
        (savedLanguage !== 'javascript' &&
          isGenericStarterCode(savedCode));

      setLanguage(savedLanguage);
      setProblem(savedProblem);
      setCode(
        shouldReplaceStarter
          ? getBoilerplate(savedProblem, savedLanguage)
          : savedCode
      );

      if (parsedState.topic !== undefined) {
        setTopic(parsedState.topic);
      }

      if (parsedState.difficulty !== undefined) {
        setDifficulty(parsedState.difficulty);
      }

      if (parsedState.feedback !== undefined) {
        setFeedback(parsedState.feedback);
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
  const saveDsaState = useCallback(
    (overrides = {}) => {
      if (!dsaStorageKey) return;

      try {
        const stateToSave = {
          problem: overrides.problem !== undefined ? overrides.problem : problem,
          code: overrides.code !== undefined ? overrides.code : code,
          language:
            overrides.language !== undefined ? overrides.language : language,
          topic: overrides.topic !== undefined ? overrides.topic : topic,
          difficulty:
            overrides.difficulty !== undefined
              ? overrides.difficulty
              : difficulty,
          feedback:
            overrides.feedback !== undefined ? overrides.feedback : feedback,
          evaluationError:
            overrides.evaluationError !== undefined
              ? overrides.evaluationError
              : evaluationError,
        };

        localStorage.setItem(dsaStorageKey, JSON.stringify(stateToSave));
      } catch (error) {
        console.error('Failed to save DSA Arena state:', error);
      }
    },
    [
      dsaStorageKey,
      problem,
      code,
      language,
      topic,
      difficulty,
      feedback,
      evaluationError,
    ]
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
  // Preserve saved work when the same problem and language are restored.
  useEffect(() => {
    if (!problem) return;

    if (dsaStorageKey) {
      try {
        const savedState = localStorage.getItem(dsaStorageKey);

        if (savedState) {
          const parsedState = JSON.parse(savedState);

          const isSameProblem =
            parsedState.problem?.title === problem.title;

          const isSameLanguage = parsedState.language === language;
          const hasSavedCode = typeof parsedState.code === 'string';

          if (
            isSameProblem &&
            isSameLanguage &&
            hasSavedCode &&
            !(
              language !== 'javascript' &&
              isGenericStarterCode(parsedState.code)
            )
          ) {
            return;
          }
        }
      } catch (error) {
        console.error('Failed to check saved DSA state:', error);
      }
    }

    const boilerplate = getBoilerplate(problem, language);

    setCode(boilerplate);

    saveDsaState({
      problem,
      code: boilerplate,
      language,
    });
  }, [problem, language, dsaStorageKey, saveDsaState]);

  // Generate a new problem.
  const generateProblem = async () => {
    setError(null);
    setIsLoading(true);
    setProblem(null);
    setFeedback(null);
    setEvaluationError(null);

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

      setProblem(response.data);

      // The problem effect loads the boilerplate for the selected language.
      saveDsaState({
        problem: response.data,
        topic,
        difficulty,
        feedback: null,
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
      saveDsaState({ code: value });
    },
    [saveDsaState]
  );

  // Change language and load the corresponding starter code.
  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value;

    if (!SUPPORTED_LANGUAGES.includes(newLanguage)) return;

    const newCode = getBoilerplate(problem, newLanguage);

    setLanguage(newLanguage);
    setCode(newCode);
    setFeedback(null);
    setEvaluationError(null);

    saveDsaState({
      language: newLanguage,
      code: newCode,
      feedback: null,
      evaluationError: null,
    });
  };

  // Submit code for AI evaluation.
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
    setFeedback(null);

    try {
      const token = await getToken();

      if (!token) {
        setEvaluationError('Your session is not ready. Please try again.');
        return;
      }

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/evaluate-code`,
        {
          problem,
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

      setFeedback(response.data);
      saveDsaState({ feedback: response.data });

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

      setEvaluationError(errorMessage);
      saveDsaState({ evaluationError: errorMessage });
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
      saveDsaState({ code: formattedCode });
    } catch (error) {
      console.error('Failed to format code:', error);
    }
  };

  // Close the feedback panel.
  const closeFeedbackPanel = () => {
    setFeedback(null);
    setEvaluationError(null);

    saveDsaState({
      feedback: null,
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

  const status = getFeedbackStatus();

  return (
    <div className="flex flex-col flex-1 h-full">
      <DsaCoach activeProblem={problem} code={code} language={language} />

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
                theme={okaidia}
                extensions={[langExtension]}
                onChange={onChange}
                style={{ fontSize: '16px' }}
              />
            </div>

            <div className="p-2 bg-background border-t border-text-secondary/20">
              <button
                onClick={handleCodeSubmission}
                disabled={isEvaluating || !problem}
                className="bg-accent text-white font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEvaluating ? 'Evaluating...' : 'Submit Code'}
              </button>
            </div>
          </div>

          {(isEvaluating || evaluationError || feedback) && (
            <div className="flex-1 flex flex-col bg-surface/70 p-4 rounded-lg border border-text-secondary/20 overflow-hidden">
              <div className="flex justify-between items-center mb-4 border-b border-text-secondary/20 pb-2 flex-shrink-0">
                <h2 className="text-xl font-bold text-accent">AI Feedback</h2>

                <button
                  onClick={closeFeedbackPanel}
                  className="text-text-secondary hover:text-text-primary"
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

              <div className="flex-1 overflow-y-auto pr-2 text-text-secondary">
                {isEvaluating && <p>AI is evaluating your code...</p>}

                {evaluationError && (
                  <div className="text-red-400">Error: {evaluationError}</div>
                )}

                {feedback && status && (
                  <div className="space-y-4">
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
