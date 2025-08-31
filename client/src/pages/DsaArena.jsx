import React, { useState, useCallback, useEffect } from 'react';

// Import Axios to make API calls
import axios from 'axios';

// ---  Import CodeMirror and its extensions ---
import CodeMirror from '@uiw/react-codemirror';
import { okaidia } from '@uiw/codemirror-theme-okaidia';
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';

//Import Prettier for code formatting
import prettier from "prettier/standalone";
import babel from 'prettier/plugins/babel';
import estree from 'prettier/plugins/estree';
import * as javaPlugin from "prettier-plugin-java";

const DsaArena = () => {
  // ---  Set up state to hold the code ---
  const [code, setCode] = useState(
    "function solve() {\n  // Your code here\n  console.log('Hello, PrepAI!');\n}"
  );
  //  Adding state for the selected language and its CodeMirror extension ---
  const [language, setLanguage] = useState('javascript');
  const [langExtension, setLangExtension] = useState(javascript({ jsx: true }));


  //  State for problem generation 
  const [problem, setProblem] = useState(null);
  const [topic, setTopic] = useState('Arrays');
  const [difficulty, setDifficulty] = useState('Easy');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Add state for code evaluation
  const [feedback, setFeedback] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState(null);

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
  }, [language]); // This effect runs whenever the 'language' state changes

  useEffect(() => {
    if (problem && problem.boilerplates) {
      setCode(problem.boilerplates[language] || `// Boilerplate for ${language} not available.`);
    }
  }, [problem, language]); // This runs when the problem or language changes

  // useCallback ensures this function isn't recreated on every render
  const onChange = useCallback((value, viewUpdate) => {
    setCode(value);
  }, []);

  //  NEW: Function to generate a problem 
  const generateProblem = async () => {
    setError(null);
    setIsLoading(true);
    setProblem(null);
    setFeedback(null);
    try {
      const response = await axios.post('http://localhost:8000/api/generate-problem', { topic, difficulty });
      setProblem(response.data);
    } catch (err) {
      const errorMessage = err.response ? err.response.data.error : 'An unexpected error occurred.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  //  Create the function to handle code submission
  const handleCodeSubmission = async () => {
    if (!problem) {
      setEvaluationError("Please generate a problem first.");
      return;
    }
    setEvaluationError(null);
    setIsEvaluating(true);
    setFeedback(null);
    try {
      const response = await axios.post('http://localhost:8000/api/evaluate-code', {
        problem,
        code,
        language,
      });
      setFeedback(response.data);
    } catch (err) {
      const errorMessage = err.response ? err.response.data.error : 'An unexpected error occurred.';
      setEvaluationError(errorMessage);
    } finally {
      setIsEvaluating(false);
    }
  };

  //  Function to format the code using Prettier
   const handleFormatCode = async () => {
    try {
      let parser;
      let plugins; // <-- FIX: Declare plugins here, outside the switch

      switch (language) {
        case 'javascript':
          parser = 'babel';
          plugins = [babel, estree]; // Assign value inside the switch
          break;
        case 'java':
          parser = 'java';
          plugins = [javaPlugin]; // Assign value inside the switch
          break;
        default:
          console.log(`Formatting for ${language} is not yet supported.`);
          return;
      }

      const formattedCode = await prettier.format(code, {
        parser: parser,
        plugins: plugins, // Now this variable is accessible here
        singleQuote: true,
        trailingComma: 'es5',
      });
      setCode(formattedCode);
    } catch (error) {
      console.error("Failed to format code:", error);
    }
  };
 
  // For closing the feedback panel when clicking close
  const closeFeedbackPanel = () => {
    setFeedback(null);
    setEvaluationError(null);
  };

  return (
    <div className="flex flex-col flex-1 h-full">
      {/* Header */}
      <header className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-bold text-text-primary">DSA Arena</h1>
        <p className="text-text-secondary">Select a topic, solve the problem, and get instant AI feedback.</p>
      </header>

      {/* Main two-panel layout */}
      <div className="flex flex-1 flex-col lg:flex-row gap-6 overflow-hidden">

        {/* Left Panel: Problem Statement (now wider) */}
        <div className="lg:w-2/5 flex flex-col bg-surface/70 p-4 rounded-lg border border-text-secondary/20 overflow-hidden">
          <h2 className="text-xl font-bold text-accent mb-4 border-b border-text-secondary/20 pb-2 flex-shrink-0">Problem</h2>

          {/* UI for Topic, Difficulty, and the Button */}
          <div className="space-y-4 mb-4 flex-shrink-0">
            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-text-secondary mb-1">Topic</label>
              <select id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full bg-background text-text-primary rounded px-2 py-1 border border-text-secondary/30">
                <option>Arrays</option><option>Strings</option><option>Linked List</option><option>Trees</option><option>Graphs</option>
              </select>
            </div>
            <div>
              <label htmlFor="difficulty" className="block text-sm font-medium text-text-secondary mb-1">Difficulty</label>
              <select id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full bg-background text-text-primary rounded px-2 py-1 border border-text-secondary/30">
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
            </div>
            <button onClick={generateProblem} disabled={isLoading} className="w-full bg-accent text-white font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? 'Generating...' : 'Generate Problem'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 text-text-secondary">
            {isLoading && <p>Generating a new problem...</p>}
            {error && <div className="text-red-400">Error: {error}</div>}
            {!problem && !isLoading && !error && <p>Select a topic and difficulty, then click "Generate Problem".</p>}
            {problem && (
              <div>
                <h3 className="text-lg font-bold text-text-primary mb-2">{problem.title}</h3>
                <p className="whitespace-pre-wrap mb-4">{problem.description}</p>
                <h4 className="font-semibold text-text-primary mb-2">Examples:</h4>
                {problem.examples.map((ex, index) => (
                  <div key={index} className="bg-background/50 p-2 rounded mb-2 text-sm">
                    <p><strong>Input:</strong> <code className="text-accent">{typeof ex.input === 'string' ? ex.input : JSON.stringify(ex.input)}</code></p>
                    <p><strong>Output:</strong> <code className="text-accent">{typeof ex.output === 'string' ? ex.output : JSON.stringify(ex.output)}</code></p>
                    {ex.explanation && <p className="text-xs mt-1"><em>{ex.explanation}</em></p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Container for Editor and Feedback (now wider) */}
        <div className="lg:w-3/5 flex flex-col gap-6 overflow-hidden">

          {/* Top part: Code Editor */}
          <div className="flex-1 flex flex-col bg-surface/70 rounded-lg border border-text-secondary/20 overflow-hidden">
            <div className="bg-background p-2 border-b border-text-secondary/20 flex justify-between items-center">
              <h2 className="text-xl font-bold text-accent">Your Solution</h2>
              <div className="flex items-center gap-4">
                {/*  Format Button */}
                <button onClick={handleFormatCode} title="Format Code" className="text-text-secondary hover:text-text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 8.3 9c0 2.3 1.9 3.5 3.7 3.5s3.7-1.2 3.7-3.5A3.6 3.6 0 0 0 15 4.7c-.6-1.1-1.8-1.7-3-1.7Z" /><path d="M12 14v8" /><path d="M5 14h14" /></svg>
                </button>
                {/* --- Adding the language selector dropdown --- */}
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="bg-surface text-text-primary rounded px-2 py-1 border border-text-secondary/30 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                </select>
              </div>
            </div>

            {/* --- Step 4: Replace placeholder div with the CodeMirror component --- */}
            <div className="flex-1 overflow-y-auto"> {/* We make this container scrollable */}
              <CodeMirror
                value={code}
                height="100%"
                theme={okaidia} // Apply the dark theme
                extensions={[langExtension]} // Enable JavaScript syntax highlighting
                onChange={onChange}
                style={{ fontSize: '16px' }} // Optional: Adjust font size
              />
            </div>
            {/* ------------------------------------------------------------------- */}

            <div className="p-2 bg-background border-t border-text-secondary/20">
              {/* Connect the button to the handler and add dynamic text/disabled state */}
              <button
                onClick={handleCodeSubmission}
                disabled={isEvaluating || !problem}
                className="bg-accent text-white font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEvaluating ? 'Evaluating...' : 'Submit Code'}
              </button>
            </div>
          </div>

          {/* Bottom part: AI Feedback (conditionally rendered) */}
          {(isEvaluating || evaluationError || feedback) && (
            <div className="flex-1 flex flex-col bg-surface/70 p-4 rounded-lg border border-text-secondary/20 overflow-hidden">
              <div className="flex justify-between items-center mb-4 border-b border-text-secondary/20 pb-2 flex-shrink-0">
                <h2 className="text-xl font-bold text-accent">AI Feedback</h2>
                <button onClick={closeFeedbackPanel} className="text-text-secondary hover:text-text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 text-text-secondary">
                {isEvaluating && <p>AI is evaluating your code...</p>}
                {evaluationError && <div className="text-red-400">Error: {evaluationError}</div>}
                {feedback && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-text-primary mb-1">Correctness</h4>
                      <p className="text-sm">{feedback.correctness}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-text-primary mb-1">Time Complexity</h4>
                      <p className="text-sm">{feedback.timeComplexity}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-text-primary mb-1">Space Complexity</h4>
                      <p className="text-sm">{feedback.spaceComplexity}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-text-primary mb-1">Optimization</h4>
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