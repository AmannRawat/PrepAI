// src/pages/DsaArena.jsx
import React from 'react';

const DsaArena = () => {
  return (
    <div className="flex flex-col flex-1 h-full">
      {/* Header */}
      <header className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-bold text-text-primary">DSA Arena</h1>
        <p className="text-text-secondary">Select a topic, solve the problem, and get instant AI feedback.</p>
      </header>

      {/* Main three-panel layout */}
      {/* This div is the container for our three columns. */}
      <div className="flex flex-1 flex-col lg:flex-row gap-6 overflow-hidden">

        {/* Left Panel: Problem Statement */}
        <div className="lg:w-1/4 flex flex-col bg-surface/70 p-4 rounded-lg border border-text-secondary/20">
          <h2 className="text-xl font-bold text-accent mb-4 border-b border-text-secondary/20 pb-2">Problem</h2>
          <div className="flex-1 overflow-y-auto pr-2"> {/* pr-2 adds a little padding for the scrollbar */}
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
          </div>
          {/* CodeMirror editor will go here */}
          <div className="flex-1 p-4 text-text-secondary">
            Code editor will be placed here in the next step.
          </div>
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
