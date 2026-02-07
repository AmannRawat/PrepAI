import { useState } from 'react';
import { Upload, Loader2, AlertCircle, LogIn, CheckCircle } from 'lucide-react'; // An icon for our upload button
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import axios from 'axios';

const ResumeReviewer = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const { token, isLoggedIn } = useAuth(); // <--- Get isLoggedIn
  const { openLogin } = useModal();

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
      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
          // Only add Authorization if logged in
          ...(isLoggedIn && token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      };

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/review-resume`, formData, config);
      setFeedback(response.data); // Store the AI's feedback object
      //  Record this activity for the daily streak 
      if (isLoggedIn) {
        axios.post(`${import.meta.env.VITE_API_URL}/api/user/record-activity`, {}, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => console.error("Failed to record activity:", err));
      }

    } catch (err) {
      const errorMessage = err.response ? err.response.data.error : 'An unexpected error occurred.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full">
      <header className="mb-6 flex-shrink-0">

        {/* <--- NEW: Guest Banner */}
        {!isLoggedIn && (
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-3 rounded-lg mb-4 text-sm flex items-center gap-3">
            <AlertCircle size={20} className="flex-shrink-0" />
            <div>
              <span className="font-bold">Guest Mode:</span> You can analyze your resume for free, but the report will not be saved to your profile.
              <button onClick={openLogin} className="ml-2 underline hover:text-blue-300">Log In to Save</button>
            </div>
          </div>
        )}

        <h1 className="text-3xl font-bold text-text-primary">Resume Reviewer</h1>
        <p className="text-text-secondary">Upload your resume as a PDF to get instant AI feedback.</p>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row gap-6 overflow-hidden">

        {/* --- Left Column: Upload Area --- */}
        <div className="lg:w-1/3 flex flex-col items-center justify-center bg-surface/70 p-8 rounded-lg border-2 border-dashed border-text-secondary/30 text-center h-fit">
          <label
            htmlFor="resume-upload"
            className="cursor-pointer flex flex-col items-center justify-center w-full"
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
            <div className="mt-4 p-3 bg-background/50 rounded-lg w-full flex items-center justify-center gap-2">
              <CheckCircle size={16} className="text-green-500" />
              <span className="text-sm font-semibold text-text-primary truncate max-w-[200px]">{fileName}</span>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!selectedFile || isLoading}
            className="mt-6 w-full bg-accent text-white font-bold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <> <Loader2 className="animate-spin h-5 w-5" /> Analyzing... </>
            ) : (
              'Analyze Resume'
            )}
          </button>
        </div>

        {/* --- Right Column: Feedback Area --- */}
        <div className="lg:w-2/3 flex flex-col bg-surface/70 p-6 rounded-lg border border-text-secondary/20 overflow-hidden relative">
          <h2 className="text-xl font-bold text-accent mb-4 border-b border-text-secondary/20 pb-2 flex-shrink-0">AI Feedback</h2>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {isLoading && (
              <div className="flex flex-col justify-center items-center h-full gap-4 opacity-70">
                <Loader2 className="animate-spin h-12 w-12 text-accent" />
                <p className="text-text-secondary animate-pulse">Reading PDF & Generating Feedback...</p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg">
                <h3 className="font-bold flex items-center gap-2 mb-1"><AlertCircle size={18} /> Error Analyzing Resume</h3>
                <p className="text-sm">{error}</p>
              </div>
            )}

            {!isLoading && !error && !feedback && (
              <div className="h-full flex flex-col items-center justify-center text-text-secondary opacity-50">
                <Upload size={48} className="mb-4" />
                <p>Upload a resume to see detailed AI analysis here.</p>
              </div>
            )}

            {feedback && (
              <div className="space-y-6 text-text-secondary pb-20"> {/* Added padding bottom for CTA */}
                {/* ATS Assessment */}
                <div className="bg-background/50 p-4 rounded-lg border border-text-secondary/10">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-text-primary">ATS Score</h3>
                    <span className={`text-2xl font-black ${feedback.atsAssessment?.estimatedScore >= 75 ? 'text-green-500' :
                        feedback.atsAssessment?.estimatedScore >= 50 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                      {feedback.atsAssessment?.estimatedScore || '0'}/100
                    </span>
                  </div>
                  <p className="text-sm">{feedback.atsAssessment?.explanation}</p>
                </div>

                {/* Strengths */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
                    <CheckCircle size={18} className="text-green-500" /> Key Strengths
                  </h3>
                  <ul className="list-disc list-inside space-y-1 pl-2">
                    {/* Handle if it's a string or array */}
                    {Array.isArray(feedback.strengths)
                      ? feedback.strengths.map((s, i) => <li key={i}>{s}</li>)
                      : <p className="whitespace-pre-wrap">{feedback.strengths}</p>
                    }
                  </ul>
                </div>

                {/* Improvements */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
                    <AlertCircle size={18} className="text-yellow-500" /> Areas for Improvement
                  </h3>
                  <div className="whitespace-pre-wrap pl-2">{feedback.areasForImprovement}</div>
                </div>
              </div>
            )}
          </div>

          {/* <--- NEW: Floating Guest CTA at bottom of results */}
          {!isLoggedIn && feedback && (
            <div className="absolute bottom-4 left-4 right-4 bg-surface border border-accent/30 shadow-2xl p-4 rounded-xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5">
              <div className="text-sm">
                <p className="font-bold text-text-primary">Want to save this report?</p>
                <p className="text-text-secondary text-xs">Log in to save this analysis and use it for personalized mock interviews.</p>
              </div>
              <button
                onClick={openLogin}
                className="bg-accent hover:bg-accent-darker text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <LogIn size={16} /> Log In & Save
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ResumeReviewer;