import { useState, useCallback, useEffect } from 'react';

// --- Step 2: Import CodeMirror and its extensions ---
import CodeMirror from '@uiw/react-codemirror';
import { okaidia } from '@uiw/codemirror-theme-okaidia';
// ----------------------------------------------------
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';

const DsaArena = () => {
  // --- Step 3: Set up state to hold the code ---
  const [code, setCode] = useState(
    "function solve() {\n  // Your code here\n  console.log('Hello, PrepAI!');\n}"
  );
//  Adding state for the selected language and its CodeMirror extension ---
  const [language, setLanguage] = useState('javascript');
  const [langExtension, setLangExtension] = useState(javascript({ jsx: true }));

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


  // useCallback ensures this function isn't recreated on every render
  const onChange = useCallback((value, viewUpdate) => {
    setCode(value);
  }, []);
  // ---------------------------------------------

  return (
    <div className="flex flex-col flex-1 h-full">
      {/* Header */}
      <header className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-bold text-text-primary">DSA Arena</h1>
        <p className="text-text-secondary">Select a topic, solve the problem, and get instant AI feedback.</p>
      </header>

      {/* Main three-panel layout */}
      <div className="flex flex-1 flex-col lg:flex-row gap-6 overflow-hidden">

        {/* Left Panel: Problem Statement */}
        <div className="lg:w-1/4 flex flex-col bg-surface/70 p-4 rounded-lg border border-text-secondary/20">
          <h2 className="text-xl font-bold text-accent mb-4 border-b border-text-secondary/20 pb-2">Problem</h2>
          <div className="flex-1 overflow-y-auto pr-2">
            <p className="text-text-secondary">
              Problem description will be generated here. For now, here is a placeholder:
              <br /><br />
              <strong>Title:</strong> Find the Missing Number
              <br /><br />
              <strong>Description:</strong> Given an array `nums` containing `n` distinct numbers in the range `[0, n]`, return the only number in the range that is missing from the array.
            </p>
          </div>
        </div>

        {/* Middle Panel: Code Editor */}
        <div className="lg:w-1/2 flex flex-col bg-surface/70 rounded-lg border border-text-secondary/20 overflow-hidden">
          <div className="bg-background p-2 border-b border-text-secondary/20 flex justify-between items-center">
            <h2 className="text-xl font-bold text-accent">Your Solution</h2>
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
            <button className="bg-accent text-white font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity">
              Submit Code
            </button>
          </div>
        </div>

        {/* Right Panel: AI Feedback */}
        <div className="lg:w-1/4 flex flex-col bg-surface/70 p-4 rounded-lg border border-text-secondary/20">
          <h2 className="text-xl font-bold text-accent mb-4 border-b border-text-secondary/20 pb-2">AI Feedback</h2>
          <div className="flex-1 overflow-y-auto pr-2">
            <p className="text-text-secondary">
              AI feedback on your submitted code will appear here. This will include correctness, time/space complexity analysis, and suggestions for improvement.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DsaArena;