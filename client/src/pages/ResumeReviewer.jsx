import  { useState } from 'react';
import { Upload, Loader2 } from 'lucide-react'; // An icon for our upload button
import axios from 'axios';

const ResumeReviewer = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // This function runs when the user selects a file
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setFileName(file.name);
      setError(null); // Clear previous errors on new file selection
      setFeedback(null); // Clear previous feedback
    } else {
      alert("Please select a PDF file.");
      setSelectedFile(null);
      setFileName('');
    }
  };

  // This function will run when we click the "Analyze" button
  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Please select a file first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setFeedback(null);

    // Use FormData to send the file
    const formData = new FormData();
    formData.append('resume', selectedFile); // 'resume' must match the key expected by multer

    try {
      const response = await axios.post('http://localhost:8000/api/review-resume', formData, {
        headers: {
          'Content-Type': 'multipart/form-data', // Important header for file uploads
        },
      });
      setFeedback(response.data); // Store the AI's feedback object
    } catch (err) {
      const errorMessage = err.response ? err.response.data.error : 'An unexpected error occurred.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full">
    <header className="mb-6 flex-shrink-0"> {/* Use flex-shrink-0 */}
      <h1 className="text-3xl font-bold text-text-primary">Resume Reviewer</h1>
      <p className="text-text-secondary">Upload your resume as a PDF to get instant AI feedback.</p>
    </header>

    {/* --- NEW --- Two-column layout container */}
    <div className="flex flex-1 flex-col lg:flex-row gap-6 overflow-hidden">

      {/* --- Left Column: Upload Area --- */}
      <div className="lg:w-1/3 flex flex-col items-center justify-center bg-surface/70 p-8 rounded-lg border-2 border-dashed border-text-secondary/30 text-center">
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
          disabled={!selectedFile || isLoading}
          className="mt-6 bg-accent text-white font-bold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin h-5 w-5 mr-2" /> Analyzing...
            </>
          ) : (
            'Analyze Resume'
          )}
        </button>
      </div>

      {/* --- Right Column: Feedback Area --- */}
      <div className="lg:w-2/3 flex flex-col bg-surface/70 p-6 rounded-lg border border-text-secondary/20 overflow-hidden">
         <h2 className="text-xl font-bold text-accent mb-4 border-b border-text-secondary/20 pb-2 flex-shrink-0">AI Feedback</h2> {/* Added title */}
         <div className="flex-1 overflow-y-auto pr-2"> {/* Added padding for scrollbar */}
            {isLoading && (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="animate-spin h-8 w-8 text-accent" />
                <p className="ml-3 text-text-secondary">AI is analyzing your resume...</p>
              </div>
            )}
            {error && (
              <div className="text-red-400">
                <h3 className="font-semibold mb-2">Error Analyzing Resume:</h3>
                <p>{error}</p>
              </div>
            )}
            {!isLoading && !error && !feedback && (
              <p className="text-text-secondary text-center">Your feedback will appear here after analysis.</p>
            )}
            {feedback && (
              <div className="space-y-6 text-text-secondary">
                {/* ATS Assessment */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2 border-b border-text-secondary/20 pb-1">ATS Compatibility Assessment</h3>
                  <p className="mb-1">
                      <strong className="text-text-primary">Estimated Score:</strong>
                      <span className="text-2xl font-bold ml-2 text-accent">
                          {feedback.atsAssessment?.estimatedScore || 'N/A'} / 100
                      </span>
                  </p>
                  <p className="whitespace-pre-wrap mt-2">{feedback.atsAssessment?.explanation}</p>
                </div>
                {/* Strengths */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2 border-b border-text-secondary/20 pb-1">Key Strengths</h3>
                  <p className="whitespace-pre-wrap">{feedback.strengths}</p>
                </div>
                {/* Areas for Improvement */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2 border-b border-text-secondary/20 pb-1">Major Areas for Improvement</h3>
                  <p className="whitespace-pre-wrap">{feedback.areasForImprovement}</p>
                </div>
                {/* Action Verb Suggestions */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2 border-b border-text-secondary/20 pb-1">Action Verb Suggestions</h3>
                  <p className="whitespace-pre-wrap">
                      {typeof feedback.actionVerbSuggestions === 'string' 
                          ? feedback.actionVerbSuggestions 
                          : JSON.stringify(feedback.actionVerbSuggestions, null, 2)}
                  </p>
                </div>
                {/* Quantification Suggestions */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2 border-b border-text-secondary/20 pb-1">Quantification Suggestions</h3>
                  <p className="whitespace-pre-wrap">
                      {typeof feedback.quantificationSuggestions === 'string' 
                          ? feedback.quantificationSuggestions 
                          : JSON.stringify(feedback.quantificationSuggestions, null, 2)}
                  </p>
                </div>
              </div>
            )}
         </div>
      </div>
      {/* --- END Right Column --- */}
      </div>
    {/* --- END Two-column layout container --- */}
  </div>
  );
};

export default ResumeReviewer;