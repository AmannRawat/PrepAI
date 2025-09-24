import React, { useState } from 'react';
import { Upload } from 'lucide-react'; // An icon for our upload button

const ResumeReviewer = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');

  // This function runs when the user selects a file
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setFileName(file.name);
    } else {
      // Handle non-PDF files if you want
      alert("Please select a PDF file.");
      setSelectedFile(null);
      setFileName('');
    }
  };

  // This function will run when we click the "Analyze" button
  const handleUpload = () => {
    if (!selectedFile) {
      alert("Please select a file first.");
      return;
    }
    // In the next step, we will add the logic here to send the file to the backend.
    console.log("Uploading file:", selectedFile.name);
  };

  return (
    <div className="flex flex-col flex-1 h-full">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-text-primary">Resume Reviewer</h1>
        <p className="text-text-secondary">Upload your resume as a PDF to get instant AI feedback.</p>
      </header>
      
      <div className="flex-1 flex flex-col items-center justify-center bg-surface/70 p-8 rounded-lg border-2 border-dashed border-text-secondary/30 text-center">
        <label
          htmlFor="resume-upload"
          className="cursor-pointer flex flex-col items-center justify-center"
        >
          <Upload className="w-16 h-16 text-accent mb-4" />
          <h2 className="text-xl font-semibold text-text-primary">Click to upload your resume</h2>
          <p className="text-text-secondary">or drag and drop (PDF only)</p>
          <input
            id="resume-upload"
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={handleFileChange}
          />
        </label>
        
        {fileName && (
          <p className="mt-4 text-sm text-text-secondary">
            Selected file: <span className="font-semibold text-text-primary">{fileName}</span>
          </p>
        )}
        
        <button
          onClick={handleUpload}
          disabled={!selectedFile}
          className="mt-6 bg-accent text-white font-bold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Analyze Resume
        </button>
      </div>
      
      {/* We will later add a section here to display the AI's feedback */}
    </div>
  );
};

export default ResumeReviewer;