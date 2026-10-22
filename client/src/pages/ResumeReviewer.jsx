import { useState, useCallback, useEffect } from 'react';
import {
  Upload,
  Loader2,
  AlertCircle,
  LogIn,
  CheckCircle,
  Copy,
  Check,
  Briefcase,
  FileText,
  Sparkles,
  TrendingUp,
  Layers,
  ListChecks,
  Info,
  X,
  RotateCcw,
  ShieldCheck,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import axios from 'axios';

const SAMPLE_JOB_DESCRIPTIONS = [
  {
    title: 'Full-Stack Software Engineer',
    company: 'TechCorp',
    text: `We are looking for a Full-Stack Software Engineer with 2+ years of experience to join our core product team.

Required Qualifications:
- Proficiency in JavaScript / TypeScript, React, and Node.js.
- Strong experience designing RESTful APIs and working with relational databases (PostgreSQL or MySQL).
- Solid understanding of Git, CI/CD pipelines, and automated unit/integration testing.
- Experience with Docker, cloud infrastructure (AWS or GCP), and microservices architecture.
- Strong problem-solving abilities, data structure knowledge, and collaborative teamwork skills.

Preferred Qualifications:
- Experience with Next.js, Tailwind CSS, or GraphQL.
- Familiarity with Redis caching, Kafka or message queues, and high-throughput systems.
- Bachelor's degree in Computer Science or equivalent practical engineering experience.`,
  },
  {
    title: 'Backend Systems Engineer',
    company: 'CloudScale',
    text: `Seeking a Backend Systems Engineer to build resilient distributed services handling millions of daily events.

Required Qualifications:
- 3+ years experience building backend services in Go, Java, or Node.js.
- Deep understanding of distributed systems, concurrency, and database indexing/optimization.
- Hands-on experience with Kubernetes, Docker, and containerized deployments on AWS.
- Experience monitoring production systems using Prometheus, Grafana, or Datadog.

Preferred Qualifications:
- Experience with event-driven architecture, Apache Kafka, or RabbitMQ.
- Knowledge of gRPC, protocol buffers, and low-latency networking.
- Contributions to open-source software or engineering blogs.`,
  },
  {
    title: 'Frontend / UI Engineer',
    company: 'DesignFirst',
    text: `We are hiring a Frontend Engineer passionate about crafting fast, accessible, and delightful web applications.

Required Qualifications:
- Strong expertise in modern React, TypeScript, HTML5, and CSS/Tailwind.
- Proven track record optimizing Core Web Vitals, page load speeds, and web performance.
- Experience with client-side state management, responsive design, and cross-browser testing.
- Strong collaboration with UI/UX designers, translating Figma designs into production code.

Preferred Qualifications:
- Experience with Next.js App Router, SSR, or WebSockets for real-time interactions.
- Knowledge of web accessibility (WCAG 2.1 AA compliance) and automated E2E testing (Playwright or Cypress).`,
  },
];

const ResumeReviewer = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'gaps' | 'bullets' | 'plan'
  const [copiedIndex, setCopiedIndex] = useState(null);

  const { getToken, isLoggedIn, userId } = useAuth();
  const { openLogin } = useModal();

  const resumeStorageKey = userId ? `prepai:${userId}:resume` : null;

  // Restore the previous Resume Reviewer state when the component loads
  useEffect(() => {
    if (!resumeStorageKey) return;

    try {
      const savedState = localStorage.getItem(resumeStorageKey);
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        if (parsedState.fileName) setFileName(parsedState.fileName);
        if (parsedState.jobTitle) setJobTitle(parsedState.jobTitle);
        if (parsedState.jobDescription) setJobDescription(parsedState.jobDescription);
        if (parsedState.feedback) setFeedback(parsedState.feedback);
        return;
      }
    } catch (err) {
      console.warn("Failed to restore Resume Reviewer state from localStorage:", err);
    }

    // If no localStorage record, try fetching the latest review from the backend
    if (isLoggedIn && getToken) {
      getToken().then(async (token) => {
        if (!token) return;
        try {
          const res = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/review-resume/latest`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.data?.review) {
            const rev = res.data.review;
            setFeedback(rev);
            if (rev.jobTitle) setJobTitle(rev.jobTitle);
            if (rev.jobDescription) setJobDescription(rev.jobDescription);
          }
        } catch (fetchErr) {
          console.warn("Failed to fetch latest resume review from server:", fetchErr.message);
        }
      });
    }
  }, [resumeStorageKey, isLoggedIn, getToken]);

  // Save the Resume Reviewer state to localStorage
  const saveResumeState = useCallback(
    (overrides = {}) => {
      if (!resumeStorageKey) return;

      try {
        const stateToSave = {
          fileName: overrides.fileName !== undefined ? overrides.fileName : fileName,
          jobTitle: overrides.jobTitle !== undefined ? overrides.jobTitle : jobTitle,
          jobDescription: overrides.jobDescription !== undefined ? overrides.jobDescription : jobDescription,
          feedback: overrides.feedback !== undefined ? overrides.feedback : feedback,
        };

        localStorage.setItem(resumeStorageKey, JSON.stringify(stateToSave));
      } catch (err) {
        console.error("Failed to save Resume Reviewer state:", err);
      }
    },
    [resumeStorageKey, fileName, jobTitle, jobDescription, feedback]
  );

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Please select a valid PDF file.');
      setSelectedFile(null);
      setFileName('');
      setFileSize(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds the 5MB limit. Please upload a smaller PDF.');
      setSelectedFile(null);
      setFileName('');
      setFileSize(null);
      return;
    }

    setSelectedFile(file);
    setFileName(file.name);
    setFileSize((file.size / (1024 * 1024)).toFixed(2));
    setError(null);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFileName('');
    setFileSize(null);
  };

  const handleApplySampleJd = (sample) => {
    setJobTitle(sample.title);
    setJobDescription(sample.text);
    setError(null);
  };

  const handleCopyText = (text, index) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleResetReview = () => {
    setFeedback(null);
    setError(null);
    if (resumeStorageKey) {
      try {
        localStorage.removeItem(resumeStorageKey);
      } catch (err) {
        console.warn("Failed to clear local resume review:", err);
      }
    }
  };

  const handleUpload = async () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    if (!selectedFile) {
      setError('Please select a PDF resume file to analyze.');
      return;
    }

    const trimmedJd = jobDescription.trim();
    if (!trimmedJd || trimmedJd.length < 20) {
      setError('Please enter or paste the target job description (at least 20 characters).');
      return;
    }

    setIsLoading(true);
    setError(null);
    setFeedback(null);

    const formData = new FormData();
    formData.append('resume', selectedFile);
    formData.append('jobDescription', trimmedJd);
    if (jobTitle.trim()) {
      formData.append('jobTitle', jobTitle.trim());
    }

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Your session is not ready. Please try signing in again.');
      }

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/review-resume`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const reviewData = response.data;
      setFeedback(reviewData);

      saveResumeState({
        fileName: selectedFile.name,
        jobTitle: jobTitle.trim(),
        jobDescription: trimmedJd,
        feedback: reviewData,
      });

      // Record daily preparation activity
      axios
        .post(
          `${import.meta.env.VITE_API_URL}/api/user/record-activity`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        )
        .catch((actErr) => console.warn('Failed to record activity:', actErr.message));
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.message ||
        'An unexpected error occurred while analyzing your resume.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const estimatedScore = Number(feedback?.atsAssessment?.estimatedScore) || 0;
  const breakdown = feedback?.atsAssessment?.breakdown;

  const scoreBadgeColor =
    estimatedScore >= 80
      ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
      : estimatedScore >= 60
      ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
      : 'text-rose-500 border-rose-500/30 bg-rose-500/10';

  const scoreLabel =
    estimatedScore >= 80
      ? 'Strong Match'
      : estimatedScore >= 60
      ? 'Moderate Match — Improvements Recommended'
      : 'Low Match — Key Requirements Missing';

  return (
    <div className="flex flex-col flex-1 h-full max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 overflow-y-auto">
      {/* Header */}
      <header className="mb-6 flex-shrink-0">
        {!isLoggedIn && (
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-3 rounded-lg mb-4 text-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0" />
              <span>
                <strong className="font-semibold">Sign in required:</strong> Log in to analyze your resume against job descriptions, save reports, and track your ATS progress.
              </span>
            </div>
            <button
              onClick={openLogin}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold whitespace-nowrap transition"
            >
              Sign In
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2.5">
              <Briefcase className="text-accent h-7 w-7" />
              <span>Resume Reviewer & ATS Matcher</span>
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Upload your resume and paste the target job description to get an ATS-style match score, evidence gap analysis, and tailored bullet rewrites.
            </p>
          </div>

          {feedback && (
            <button
              onClick={handleResetReview}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-text-secondary/20 bg-surface/50 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-text-secondary/10 transition"
              title="Start a new resume analysis"
            >
              <RotateCcw size={14} />
              <span>New Analysis</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Upload & Job Description Form */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Resume Upload Card */}
          <div className="rounded-xl border border-text-secondary/20 bg-surface/70 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
              <FileText size={16} className="text-accent" />
              <span>1. Your Resume (PDF)</span>
            </h2>

            {!selectedFile && !fileName ? (
              <label
                htmlFor="resume-upload"
                className="cursor-pointer flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-text-secondary/30 bg-background/50 p-6 text-center hover:border-accent hover:bg-accent/5 transition"
              >
                <Upload className="w-10 h-10 text-accent mb-2" />
                <span className="text-sm font-semibold text-text-primary">Click to upload resume</span>
                <span className="text-xs text-text-secondary mt-1">PDF format (max 5MB)</span>
                <input
                  id="resume-upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-text-secondary/20 bg-background/60 p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                    <CheckCircle size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary truncate">{fileName || selectedFile?.name}</p>
                    <p className="text-[11px] text-text-secondary">
                      {fileSize ? `${fileSize} MB • PDF` : 'PDF document ready'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <label
                    htmlFor="resume-upload-change"
                    className="cursor-pointer px-2 py-1 text-xs text-accent hover:underline"
                    title="Choose a different PDF"
                  >
                    Change
                    <input
                      id="resume-upload-change"
                      type="file"
                      className="hidden"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="p-1 text-text-secondary hover:text-rose-500 transition"
                    title="Remove file"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Target Job Description Card */}
          <div className="rounded-xl border border-text-secondary/20 bg-surface/70 p-5 shadow-sm flex flex-col flex-1">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Briefcase size={16} className="text-accent" />
                <span>2. Target Job Description</span>
              </h2>
              <span className="text-[11px] text-text-secondary">
                {jobDescription.length.toLocaleString()} chars
              </span>
            </div>

            <div className="mb-3">
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Target Job Title (e.g. Senior Frontend Engineer at Stripe)"
                className="w-full rounded-lg border border-text-secondary/20 bg-background/60 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/60 focus:border-accent outline-none"
              />
            </div>

            <div className="mb-3">
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the target job description, required qualifications, and responsibilities here..."
                rows={7}
                className="w-full rounded-lg border border-text-secondary/20 bg-background/60 p-3 text-xs text-text-primary placeholder:text-text-secondary/60 focus:border-accent outline-none resize-none custom-scrollbar"
              />
            </div>

            {/* Quick Sample JD Buttons */}
            <div className="mt-auto">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Quick fill example job descriptions:</p>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_JOB_DESCRIPTIONS.map((sample) => (
                  <button
                    key={sample.title}
                    type="button"
                    onClick={() => handleApplySampleJd(sample)}
                    className="rounded-md border border-text-secondary/20 bg-background/40 px-2 py-1 text-[11px] font-medium text-text-secondary hover:border-accent hover:text-accent transition"
                  >
                    {sample.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleUpload}
              disabled={isLoading || (!selectedFile && !fileName) || jobDescription.trim().length < 20}
              className="mt-4 w-full rounded-lg bg-accent py-2.5 px-4 text-xs font-bold text-white shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  <span>Analyzing Resume Against Job Description...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>Analyze Resume & Calculate ATS Match</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: ATS Report Dashboard */}
        <div className="lg:col-span-7 flex flex-col rounded-xl border border-text-secondary/20 bg-surface/70 p-5 shadow-sm overflow-hidden">
          {!isLoading && !feedback && (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-center text-text-secondary">
              <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-4">
                <ShieldCheck size={32} />
              </div>
              <h3 className="text-base font-semibold text-text-primary">Ready for ATS Matching</h3>
              <p className="mt-1 max-w-sm text-xs text-text-secondary">
                Upload your resume PDF and paste the target job description on the left to generate your ATS match score, evidence gap analysis, and tailored bullet rewrites.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-center">
              <Loader2 className="animate-spin h-12 w-12 text-accent mb-4" />
              <h3 className="text-sm font-semibold text-text-primary animate-pulse">
                Evaluating Resume & Extracting Job Signals...
              </h3>
              <p className="mt-1 text-xs text-text-secondary max-w-xs">
                Comparing skills, required qualifications, experience alignment, and keyword density.
              </p>
            </div>
          )}

          {feedback && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Navigation Tabs */}
              <div className="flex items-center gap-1 border-b border-text-secondary/20 pb-2 mb-4 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                    activeTab === 'overview'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-text-secondary/10'
                  }`}
                >
                  <TrendingUp size={14} />
                  <span>ATS Score & Overview</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('gaps')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                    activeTab === 'gaps'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-text-secondary/10'
                  }`}
                >
                  <Layers size={14} />
                  <span>Evidence & Gap Analysis</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('bullets')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                    activeTab === 'bullets'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-text-secondary/10'
                  }`}
                >
                  <Sparkles size={14} />
                  <span>Tailored Rewrites</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('plan')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                    activeTab === 'plan'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-primary hover:bg-text-secondary/10'
                  }`}
                >
                  <ListChecks size={14} />
                  <span>Action Plan</span>
                </button>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar text-xs">
                {/* TAB 1: OVERVIEW */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    {/* Score Card */}
                    <div className="rounded-xl border border-text-secondary/20 bg-background/50 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                            Estimated ATS Match Score
                          </span>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-4xl font-extrabold text-text-primary">{estimatedScore}</span>
                            <span className="text-sm text-text-secondary">/ 100</span>
                            <span className={`ml-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreBadgeColor}`}>
                              {scoreLabel}
                            </span>
                          </div>
                        </div>

                        {jobTitle && (
                          <div className="text-right">
                            <span className="text-[11px] text-text-secondary">Target Role</span>
                            <p className="text-xs font-bold text-text-primary">{jobTitle}</p>
                          </div>
                        )}
                      </div>

                      <p className="mt-3 text-text-secondary leading-relaxed text-xs">
                        {feedback.atsAssessment?.explanation}
                      </p>

                      {/* Subscore Breakdown */}
                      {breakdown && (
                        <div className="mt-4 pt-4 border-t border-text-secondary/15 space-y-2.5">
                          <h4 className="text-xs font-bold text-text-primary">Score Calculation Breakdown</h4>

                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="font-medium text-text-primary">Relevant Technical Skills (25%)</span>
                                <span className="font-semibold text-accent">{breakdown.skillsScore ?? 0} / {breakdown.skillsMax || 25}</span>
                              </div>
                              <div className="h-1.5 w-full bg-text-secondary/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-accent rounded-full transition-all"
                                  style={{ width: `${Math.min(100, ((breakdown.skillsScore || 0) / (breakdown.skillsMax || 25)) * 100)}%` }}
                                />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="font-medium text-text-primary">Required Qualifications Match (25%)</span>
                                <span className="font-semibold text-accent">{breakdown.qualificationsScore ?? 0} / {breakdown.qualificationsMax || 25}</span>
                              </div>
                              <div className="h-1.5 w-full bg-text-secondary/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, ((breakdown.qualificationsScore || 0) / (breakdown.qualificationsMax || 25)) * 100)}%` }}
                                />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="font-medium text-text-primary">Relevant Experience & Projects (20%)</span>
                                <span className="font-semibold text-accent">{breakdown.experienceScore ?? 0} / {breakdown.experienceMax || 20}</span>
                              </div>
                              <div className="h-1.5 w-full bg-text-secondary/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, ((breakdown.experienceScore || 0) / (breakdown.experienceMax || 20)) * 100)}%` }}
                                />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="font-medium text-text-primary">Keywords & Terminology (15%)</span>
                                <span className="font-semibold text-accent">{breakdown.keywordsScore ?? 0} / {breakdown.keywordsMax || 15}</span>
                              </div>
                              <div className="h-1.5 w-full bg-text-secondary/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, ((breakdown.keywordsScore || 0) / (breakdown.keywordsMax || 15)) * 100)}%` }}
                                />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="font-medium text-text-primary">Structure, Formatting & Readability (15%)</span>
                                <span className="font-semibold text-accent">{breakdown.structureScore ?? 0} / {breakdown.structureMax || 15}</span>
                              </div>
                              <div className="h-1.5 w-full bg-text-secondary/20 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, ((breakdown.structureScore || 0) / (breakdown.structureMax || 15)) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Strengths & Areas for Improvement */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
                        <h4 className="text-xs font-bold text-emerald-500 flex items-center gap-1.5 mb-2">
                          <CheckCircle size={15} />
                          <span>Key Strengths for this Role</span>
                        </h4>
                        <ul className="space-y-1.5 text-text-secondary">
                          {Array.isArray(feedback.strengths) && feedback.strengths.length > 0 ? (
                            feedback.strengths.map((str, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-emerald-500 font-bold shrink-0">•</span>
                                <span>{str}</span>
                              </li>
                            ))
                          ) : (
                            <li>Solid foundation matching target role fundamentals.</li>
                          )}
                        </ul>
                      </div>

                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
                        <h4 className="text-xs font-bold text-amber-500 flex items-center gap-1.5 mb-2">
                          <AlertTriangle size={15} />
                          <span>Primary Improvement Areas</span>
                        </h4>
                        <ul className="space-y-1.5 text-text-secondary">
                          {Array.isArray(feedback.areasForImprovement) && feedback.areasForImprovement.length > 0 ? (
                            feedback.areasForImprovement.map((imp, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-amber-500 font-bold shrink-0">•</span>
                                <span>{imp}</span>
                              </li>
                            ))
                          ) : (
                            <li>{feedback.areasForImprovement || "Incorporate more measurable metrics and role-specific keywords."}</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* ATS Limitations Callout */}
                    <div className="rounded-xl border border-text-secondary/15 bg-background/40 p-3 flex items-start gap-2.5 text-[11px] text-text-secondary leading-relaxed">
                      <Info size={16} className="text-accent shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-text-primary">ATS System Limitations Disclaimer: </span>
                        {feedback.atsAssessment?.limitationsDisclaimer ||
                          "This score is PrepAI's algorithmic simulation based on software engineering hiring standards and keyword alignment. Real ATS systems (e.g. Workday, Greenhouse, Lever) index and rank candidate data for human recruiters rather than using a single reject score."}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: EVIDENCE & GAPS */}
                {activeTab === 'gaps' && (
                  <div className="space-y-4">
                    {/* Notice on absence from resume */}
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5 text-[11px] text-blue-400 flex items-center gap-2">
                      <Info size={14} className="shrink-0" />
                      <span>
                        <strong>Note:</strong> Items marked as missing were not detected in your resume text. This does <em>not</em> mean you lack the personal ability. If you have this experience, incorporate it using the rewrites tab.
                      </span>
                    </div>

                    {/* Required Qualifications */}
                    <div>
                      <h3 className="text-xs font-bold text-text-primary mb-2 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />
                        <span>Required Qualifications (Must-Haves)</span>
                      </h3>

                      <div className="space-y-2">
                        {Array.isArray(feedback.qualificationsAnalysis?.required) &&
                        feedback.qualificationsAnalysis.required.length > 0 ? (
                          feedback.qualificationsAnalysis.required.map((req, idx) => {
                            const isSupported = req.status === 'supported';
                            const isWeak = req.status === 'weak';
                            return (
                              <div
                                key={idx}
                                className={`rounded-lg border p-3 ${
                                  isSupported
                                    ? 'border-emerald-500/25 bg-emerald-500/5'
                                    : isWeak
                                    ? 'border-amber-500/25 bg-amber-500/5'
                                    : 'border-rose-500/25 bg-rose-500/5'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-semibold text-text-primary text-xs">
                                    {req.requirement}
                                  </span>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      isSupported
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : isWeak
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-rose-500/20 text-rose-400'
                                    }`}
                                  >
                                    {isSupported ? 'Supported' : isWeak ? 'Weak Evidence' : 'Missing from Resume'}
                                  </span>
                                </div>

                                <div className="mt-1.5 text-[11px] text-text-secondary">
                                  <span className="font-medium text-text-primary">Evidence: </span>
                                  <span>{req.evidence || 'Not mentioned in resume text.'}</span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-text-secondary italic">No specific required qualifications extracted.</p>
                        )}
                      </div>
                    </div>

                    {/* Preferred Qualifications */}
                    {Array.isArray(feedback.qualificationsAnalysis?.preferred) &&
                      feedback.qualificationsAnalysis.preferred.length > 0 && (
                        <div className="pt-2">
                          <h3 className="text-xs font-bold text-text-primary mb-2 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                            <span>Preferred / Bonus Qualifications</span>
                          </h3>

                          <div className="space-y-2">
                            {feedback.qualificationsAnalysis.preferred.map((pref, idx) => {
                              const isSupported = pref.status === 'supported';
                              const isWeak = pref.status === 'weak';
                              return (
                                <div
                                  key={idx}
                                  className={`rounded-lg border p-3 ${
                                    isSupported
                                      ? 'border-emerald-500/25 bg-emerald-500/5'
                                      : isWeak
                                      ? 'border-amber-500/25 bg-amber-500/5'
                                      : 'border-text-secondary/15 bg-background/40'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="font-semibold text-text-primary text-xs">
                                      {pref.requirement}
                                    </span>
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        isSupported
                                          ? 'bg-emerald-500/20 text-emerald-400'
                                          : isWeak
                                          ? 'bg-amber-500/20 text-amber-400'
                                          : 'bg-text-secondary/20 text-text-secondary'
                                      }`}
                                    >
                                      {isSupported ? 'Supported' : isWeak ? 'Partial' : 'Bonus / Missing'}
                                    </span>
                                  </div>

                                  <div className="mt-1.5 text-[11px] text-text-secondary">
                                    <span className="font-medium text-text-primary">Evidence: </span>
                                    <span>{pref.evidence || 'Not mentioned in resume.'}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* TAB 3: TAILORED REWRITES */}
                {activeTab === 'bullets' && (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-emerald-400 flex items-center gap-2">
                      <Sparkles size={14} className="shrink-0" />
                      <span>
                        These bullet rewrites are grounded in your actual projects and experience. Incorporate your real metrics — never fabricate false numbers or employment claims.
                      </span>
                    </div>

                    {/* Bullet Improvements */}
                    <div className="space-y-3">
                      {Array.isArray(feedback.bulletImprovements) && feedback.bulletImprovements.length > 0 ? (
                        feedback.bulletImprovements.map((bullet, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-text-secondary/20 bg-background/50 p-3.5 space-y-2.5"
                          >
                            {/* Original */}
                            <div className="rounded-lg bg-surface/80 p-2.5 border border-text-secondary/15">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Original Bullet</span>
                              <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                                {bullet.original || "Original bullet text"}
                              </p>
                            </div>

                            {/* Improved */}
                            <div className="rounded-lg bg-emerald-500/10 p-2.5 border border-emerald-500/30 relative">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                                  Recommended ATS Rewrite
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(bullet.improved, idx)}
                                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition"
                                >
                                  {copiedIndex === idx ? (
                                    <>
                                      <Check size={12} />
                                      <span>Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={12} />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <p className="text-xs font-medium text-text-primary leading-relaxed">
                                {bullet.improved}
                              </p>
                            </div>

                            {/* Rationale & Keywords */}
                            <div className="flex flex-col gap-1.5 text-[11px]">
                              {bullet.rationale && (
                                <p className="text-text-secondary">
                                  <strong className="text-text-primary">Why this helps: </strong>
                                  {bullet.rationale}
                                </p>
                              )}

                              {Array.isArray(bullet.keywordsAdded) && bullet.keywordsAdded.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="font-medium text-text-primary">Keywords integrated:</span>
                                  {bullet.keywordsAdded.map((kw, kIdx) => (
                                    <span
                                      key={kIdx}
                                      className="rounded bg-accent/15 text-accent px-1.5 py-0.5 text-[10px] font-semibold"
                                    >
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {bullet.clarificationNeeded && (
                                <p className="text-amber-400/90 italic">
                                  ⚠️ {bullet.clarificationNeeded}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-text-secondary italic">No specific bullet rewrites generated.</p>
                      )}
                    </div>

                    {/* Action Verbs & Quantification Recommendations */}
                    {(feedback.actionVerbSuggestions || feedback.quantificationSuggestions) && (
                      <div className="mt-4 pt-4 border-t border-text-secondary/15 space-y-3">
                        {feedback.actionVerbSuggestions && (
                          <div className="rounded-lg bg-surface/60 p-3 border border-text-secondary/15">
                            <h4 className="text-xs font-bold text-text-primary mb-1">Action Verb Optimization</h4>
                            <p className="text-[11px] text-text-secondary leading-relaxed">
                              {feedback.actionVerbSuggestions}
                            </p>
                          </div>
                        )}

                        {feedback.quantificationSuggestions && (
                          <div className="rounded-lg bg-surface/60 p-3 border border-text-secondary/15">
                            <h4 className="text-xs font-bold text-text-primary mb-1">Quantifying Impact</h4>
                            <p className="text-[11px] text-text-secondary leading-relaxed">
                              {feedback.quantificationSuggestions}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: PRIORITIZED ACTION PLAN */}
                {activeTab === 'plan' && (
                  <div className="space-y-4">
                    {/* High Priority */}
                    {Array.isArray(feedback.prioritizedActionPlan?.highPriority) &&
                      feedback.prioritizedActionPlan.highPriority.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-rose-500 mb-2 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />
                            <span>High Priority (Crucial for Passing Recruiter & ATS Filter)</span>
                          </h3>
                          <div className="space-y-2">
                            {feedback.prioritizedActionPlan.highPriority.map((item, idx) => (
                              <div key={idx} className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
                                <h4 className="text-xs font-bold text-text-primary">{item.action}</h4>
                                <p className="mt-1 text-[11px] text-text-secondary">{item.detail}</p>
                                {item.expectedBenefit && (
                                  <div className="mt-2 text-[10px] font-medium text-rose-400 flex items-center gap-1">
                                    <ChevronRight size={12} />
                                    <span>Expected benefit: {item.expectedBenefit}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Medium Priority */}
                    {Array.isArray(feedback.prioritizedActionPlan?.mediumPriority) &&
                      feedback.prioritizedActionPlan.mediumPriority.length > 0 && (
                        <div className="pt-2">
                          <h3 className="text-xs font-bold text-amber-500 mb-2 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                            <span>Medium Priority (Evidence & Keyword Depth)</span>
                          </h3>
                          <div className="space-y-2">
                            {feedback.prioritizedActionPlan.mediumPriority.map((item, idx) => (
                              <div key={idx} className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                                <h4 className="text-xs font-bold text-text-primary">{item.action}</h4>
                                <p className="mt-1 text-[11px] text-text-secondary">{item.detail}</p>
                                {item.expectedBenefit && (
                                  <div className="mt-2 text-[10px] font-medium text-amber-400 flex items-center gap-1">
                                    <ChevronRight size={12} />
                                    <span>Expected benefit: {item.expectedBenefit}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Low Priority */}
                    {Array.isArray(feedback.prioritizedActionPlan?.lowPriority) &&
                      feedback.prioritizedActionPlan.lowPriority.length > 0 && (
                        <div className="pt-2">
                          <h3 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                            <span>Low Priority (Formatting & Readability Polish)</span>
                          </h3>
                          <div className="space-y-2">
                            {feedback.prioritizedActionPlan.lowPriority.map((item, idx) => (
                              <div key={idx} className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-3">
                                <h4 className="text-xs font-bold text-text-primary">{item.action}</h4>
                                <p className="mt-1 text-[11px] text-text-secondary">{item.detail}</p>
                                {item.expectedBenefit && (
                                  <div className="mt-2 text-[10px] font-medium text-blue-400 flex items-center gap-1">
                                    <ChevronRight size={12} />
                                    <span>Expected benefit: {item.expectedBenefit}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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

export default ResumeReviewer;