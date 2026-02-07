import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import axios from 'axios';
import { Loader2, Lock, LogIn, TrendingUp, FileText, MessageSquare } from 'lucide-react'; // For loading spinner
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid // For data visualization (charting components)
} from 'recharts';
const ProfilePage = () => {
  const { userEmail, token, userName, isLoggedIn } = useAuth();
  const { openLogin } = useModal();
  const [progress, setProgress] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Defining helper component inside the same file for simplicity.
  const DsaTopicChart = ({ data }) => {
    // Define colors for our chart
    const COLORS = ['#ffc554', '#E64833', '#00ff7f', '#8884d8', '#82ca9d'];

    return (
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value" // The 'value' key from our processed data
              nameKey="name" // The 'name' key (e.g., "Arrays")
              label={(entry) => `${entry.name} (${entry.value})`} // Show name and count
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const ResumeScoreChart = ({ data }) => {
    return (
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis dataKey="name" strokeOpacity={0.8} />
            <YAxis domain={[0, 100]} strokeOpacity={0.8} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--color-surface)', border: 'none', borderRadius: '8px' }}
              itemStyle={{ color: 'var(--color-text-primary)' }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="score"
              stroke="var(--color-accent)" // Use our theme's accent color
              strokeWidth={2}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };
  // This useEffect runs once when the component loads
  useEffect(() => {
    if (!isLoggedIn) {
      setIsLoading(false); // Stop loading immediately
      return; // Do not fetch data
    }
    const fetchProgress = async () => {
      // if (!token) {
      //   setIsLoading(false);
      //   setError("No token found. Please log in again.");
      //   return;
      // }
      try {
        // Fetch data from our new protected endpoint
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/user/progress`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        setProgress(response.data); // Save the { resumeReviews, chatSessions, dataSubmision } object
      } catch (err) {
        console.error("Error fetching progress:", err);
        setError("Failed to load progress. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

   if (token) fetchProgress();
  }, [token,isLoggedIn]); // Re-run if the token changes

 // --- DATA PROCESSING ---
  const dsaTopicData = useMemo(() => {
    if (!progress || !progress.dsaSubmissions) return [];
    const topicCounts = progress.dsaSubmissions.reduce((acc, submission) => {
      const topic = submission.topic || 'Other';
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(topicCounts).map(key => ({ name: key, value: topicCounts[key] }));
  }, [progress]);

  const resumeScoreData = useMemo(() => {
    if (!progress || !progress.resumeReviews || progress.resumeReviews.length === 0) return [];
    return progress.resumeReviews
      .map((review, index) => ({
        name: `Review ${index + 1}`,
        score: parseInt(review.atsAssessment?.estimatedScore, 10) || 0,
        date: new Date(review.createdAt).toLocaleDateString(),
      }))
      .reverse();
  }, [progress]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // --- RENDER: GUEST VIEW ---
  // If not logged in, show this "Locked" Dashboard instead of an error
  if (!isLoggedIn) {
      return (
        <div className="flex flex-col flex-1 h-full items-center justify-center p-4">
            <div className="bg-surface/50 p-8 rounded-2xl border border-text-secondary/20 max-w-2xl w-full text-center space-y-6">
                <div className="bg-accent/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                    <Lock size={40} className="text-accent" />
                </div>
                
                <h1 className="text-3xl font-bold text-text-primary">Profile Locked</h1>
                <p className="text-text-secondary text-lg">
                    Log in to track your progress, view your interview history, and see your resume score improvements over time.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                    <div className="bg-background/50 p-4 rounded-lg border border-text-secondary/10">
                        <TrendingUp className="text-green-400 mb-2" />
                        <h3 className="font-bold">DSA Stats</h3>
                        <p className="text-xs text-text-secondary">Track problems solved by topic.</p>
                    </div>
                    <div className="bg-background/50 p-4 rounded-lg border border-text-secondary/10">
                        <FileText className="text-blue-400 mb-2" />
                        <h3 className="font-bold">Resume Scores</h3>
                        <p className="text-xs text-text-secondary">Watch your ATS score grow.</p>
                    </div>
                    <div className="bg-background/50 p-4 rounded-lg border border-text-secondary/10">
                        <MessageSquare className="text-purple-400 mb-2" />
                        <h3 className="font-bold">Chat History</h3>
                        <p className="text-xs text-text-secondary">Review past mock interviews.</p>
                    </div>
                </div>

                <button 
                    onClick={openLogin}
                    className="bg-accent hover:bg-accent-darker text-white font-bold py-3 px-8 rounded-lg flex items-center gap-2 mx-auto transition-all transform hover:scale-105"
                >
                    <LogIn size={20} /> Log In / Sign Up
                </button>
            </div>
        </div>
      );
  }

  // --- RENDER: USER VIEW (Normal Dashboard) ---
  return (
    <div className="flex flex-col flex-1 h-full">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-text-primary">User Profile</h1>
        <p className="text-text-secondary">Welcome back, <span className="text-accent">{userName || userEmail}</span></p>
      </header>

      <div className="space-y-8">
        {/* Loading and Error States */}
        {isLoading && (
          <div className="flex justify-center items-center h-48 bg-surface/70 rounded-lg">
            <Loader2 className="animate-spin h-8 w-8 text-accent" />
          </div>
        )}
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-lg text-red-400">
            <h3 className="font-semibold mb-2">Unable to load profile data</h3>
            <p>{error}</p>
          </div>
        )}

        {/* Dashboard Content */}
        {!isLoading && !error && progress && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* DSA Chart */}
              <div className="bg-surface/70 p-6 rounded-lg border border-text-secondary/10">
                <h2 className="text-xl font-semibold text-text-primary mb-4">DSA Topic Breakdown</h2>
                {dsaTopicData.length > 0 ? (
                  <DsaTopicChart data={dsaTopicData} />
                ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center text-text-secondary opacity-60">
                     <p>No data yet.</p>
                     <p className="text-sm">Solve a problem in the DSA Arena!</p>
                  </div>
                )}
              </div>
              
              {/* ATS Chart */}
              <div className="bg-surface/70 p-6 rounded-lg border border-text-secondary/10">
                <h2 className="text-xl font-semibold text-text-primary mb-4">ATS Score Progress</h2>
                {resumeScoreData.length > 0 ? (
                  <ResumeScoreChart data={resumeScoreData} />
                ) : (
                  <div className="h-[300px] flex flex-col items-center justify-center text-text-secondary opacity-60">
                     <p>No data yet.</p>
                     <p className="text-sm">Upload a resume to see your score trend!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent DSA List */}
            <div className="bg-surface/70 p-6 rounded-lg border border-text-secondary/10">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Recent DSA Submissions</h2>
              {progress.dsaSubmissions && progress.dsaSubmissions.length > 0 ? (
                <ul className="space-y-3">
                  {progress.dsaSubmissions.map((sub) => (
                    <li key={sub._id} className="p-4 bg-background/50 rounded-md border border-text-secondary/20 flex justify-between items-center">
                      <div>
                          <p className="font-semibold text-text-primary">{sub.problem?.title || 'DSA Problem'}</p>
                          <p className="text-xs text-text-secondary mt-1">{formatDate(sub.createdAt)}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
                        (sub.feedback?.correctness?.toLowerCase().includes('incorrect') || sub.feedback?.correctness?.toLowerCase().includes('error'))
                          ? 'text-red-400 border-red-400/30 bg-red-400/10'
                          : 'text-green-400 border-green-400/30 bg-green-400/10'
                      }`}>
                         {sub.feedback?.correctness?.toLowerCase().includes('correct') && !sub.feedback?.correctness?.toLowerCase().includes('incorrect') ? 'Solved' : 'Review Needed'}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-text-secondary italic">No submissions yet.</p>
              )}
            </div>

            {/* Recent Resume Reviews */}
            <div className="bg-surface/70 p-6 rounded-lg border border-text-secondary/10">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Recent Resume Reviews</h2>
              {progress.resumeReviews.length > 0 ? (
                <ul className="space-y-3">
                  {progress.resumeReviews.map((review) => (
                    <li key={review._id} className="p-4 bg-background/50 rounded-md border border-text-secondary/20">
                      <div className="flex justify-between">
                          <p className="font-semibold text-accent">ATS Score: {review.atsAssessment?.estimatedScore || 'N/A'}</p>
                          <p className="text-xs text-text-secondary">{formatDate(review.createdAt)}</p>
                      </div>
                      <p className="text-sm text-text-secondary mt-2 truncate">
                        Strengths: {Array.isArray(review.strengths) ? review.strengths[0] : review.strengths?.substring(0, 50)}...
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-text-secondary italic">No resume reviews yet.</p>
              )}
            </div>

           {/* Recent Chats */}
            <div className="bg-surface/70 p-6 rounded-lg border border-text-secondary/10">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Recent Behavioral Chats</h2>
              {progress.chatSessions.length > 0 ? (
                <ul className="space-y-3">
                  {progress.chatSessions.map((session) => {
                      const lastMsg = session.messages && session.messages.length > 0 
                        ? session.messages[session.messages.length - 1].text 
                        : "No preview";
                      return (
                        <li key={session._id} className="p-4 bg-background/50 rounded-md border border-text-secondary/20">
                          <div className="flex justify-between">
                             <p className="font-semibold text-text-primary">Mock Interview</p>
                             <p className="text-xs text-text-secondary">{formatDate(session.createdAt)}</p>
                          </div>
                          <p className="text-sm text-text-secondary mt-2 italic truncate">"{lastMsg}"</p>
                        </li>
                      );
                  })}
                </ul>
              ) : (
                <p className="text-text-secondary italic">No chat sessions yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;