import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Loader2 } from 'lucide-react'; // For loading spinner
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,  
  LineChart, Line, XAxis, YAxis, CartesianGrid // For data visualization (charting components)
} from 'recharts';
const ProfilePage = () => {
  const { userEmail, token,userName } = useAuth();
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
    const fetchProgress = async () => {
      if (!token) {
        setIsLoading(false);
        setError("No token found. Please log in again.");
        return;
      }

      try {
        // Fetch data from our new protected endpoint
        const response = await axios.get('http://localhost:8000/api/user/progress', {
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

    fetchProgress();
  }, [token]); // Re-run if the token changes

  //Process DSA data for our chart
  // useMemo ensures this calculation only re-runs when 'progress' changes
  const dsaTopicData = useMemo(() => {
    if (!progress || !progress.dsaSubmissions) {
      return [];
    }

    // This counts the occurrences of each topic
    const topicCounts = progress.dsaSubmissions.reduce((acc, submission) => {
      // const topic = submission.problem?.title?.split(' ')[0] || 'Other'; // Simple way to guess topic
      const topic = submission.topic || 'Other';
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {});

    // Convert the counts object into an array for Recharts
    // From { Arrays: 2, Strings: 1 } to [{ name: 'Arrays', value: 2 }, { name: 'Strings', value: 1 }]
    return Object.keys(topicCounts).map(key => ({
      name: key,
      value: topicCounts[key],
    }));
  }, [progress]);

  const resumeScoreData = useMemo(() => {
    if (!progress || !progress.resumeReviews || progress.resumeReviews.length === 0) {
      return [];
    }
    // We want the oldest scores first, so we reverse the array
    return progress.resumeReviews
      .map((review, index) => ({
        name: `Review ${index + 1}`,
        score: parseInt(review.atsAssessment?.estimatedScore, 10) || 0,
        date: new Date(review.createdAt).toLocaleDateString(),
      }))
      .reverse(); // Show progression from left to right
  }, [progress]);
  // Helper function to format the date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col flex-1 h-full">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-text-primary">User Profile</h1>
        <p className="text-text-secondary">Welcome, {userName || userEmail}</p>
      </header>

      {/* Main Content Area */}
      <div className="space-y-8">

        {/* Loading and Error States */}
        {isLoading && (
          <div className="flex justify-center items-center h-48 bg-surface/70 rounded-lg">
            <Loader2 className="animate-spin h-8 w-8 text-accent" />
          </div>
        )}
        {error && (
          <div className="bg-surface/70 p-6 rounded-lg text-red-400">
            <h3 className="font-semibold mb-2">Error:</h3>
            <p>{error}</p>
          </div>
        )}

        {/* Recent Activity (once loaded) */}
        {progress && (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* DSA Topic Breakdown */}
              <div className="bg-surface/70 p-6 rounded-lg">
                <h2 className="text-xl font-semibold text-text-primary mb-4">DSA Topic Breakdown</h2>
                {dsaTopicData.length > 0 ? (
                  <DsaTopicChart data={dsaTopicData} />
                ) : (
                  <p className="text-text-secondary h-[300px] flex items-center justify-center">Submit some DSA problems to see your progress chart!</p>
                )}
              </div>
              
              {/* ATS Score Progress */}
              <div className="bg-surface/70 p-6 rounded-lg">
                <h2 className="text-xl font-semibold text-text-primary mb-4">ATS Score Progress</h2>
                {resumeScoreData.length > 0 ? (
                  <ResumeScoreChart data={resumeScoreData} />
                ) : (
                  <p className="text-text-secondary h-[300px] flex items-center justify-center">Review your resume to track your score!</p>
                )}
              </div>
            </div>
            {/* <div className="bg-surface/70 p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-text-primary mb-4">DSA Topic Breakdown</h2>
              {dsaTopicData.length > 0 ? (
                <DsaTopicChart data={dsaTopicData} />
              ) : (
                <p className="text-text-secondary">Submit some DSA problems to see your progress chart!</p>
              )}
            </div> */}
            {/*Recent DSA Submissions Section */}
            <div className="bg-surface/70 p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Recent DSA Submissions</h2>
              {/* Check if the new dsaSubmissions array exists and has items */}
              {progress.dsaSubmissions && progress.dsaSubmissions.length > 0 ? (
                <ul className="space-y-3">
                  {progress.dsaSubmissions.map((sub) => (
                    <li key={sub._id} className="p-4 bg-background/50 rounded-md border border-text-secondary/20">
                      <p className="font-semibold text-text-primary">{sub.problem?.title || 'DSA Problem'}</p>
                      <p className={`text-sm font-medium ${(sub.feedback?.correctness?.includes('Incorrect') || sub.feedback?.correctness?.includes('not correctly') || sub.feedback?.correctness?.includes('incomplete'))
                          ? 'text-red-400' // Set to red if it's clearly wrong or incomplete
                          : (sub.feedback?.correctness?.includes('Correct') || sub.feedback?.correctness?.includes('correctly solves'))
                            ? 'text-green-400' // Set to green only if it's clearly correct
                            : 'text-yellow-400' // Default to yellow for partial/unclear
                        }`}>
                        {sub.feedback?.correctness}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">Submitted on: {formatDate(sub.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-text-secondary">No DSA submissions found. Try the DSA Arena!</p>
              )}
            </div>
            {/* Recent Resume Reviews */}
            <div className="bg-surface/70 p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Recent Resume Reviews</h2>
              {progress.resumeReviews.length > 0 ? (
                <ul className="space-y-3">
                  {progress.resumeReviews.map((review) => (
                    <li key={review._id} className="p-4 bg-background/50 rounded-md border border-text-secondary/20">
                      <p className="font-semibold text-accent">ATS Score: {review.atsAssessment?.estimatedScore || 'N/A'} / 100</p>
                      <p className="text-sm text-text-secondary mt-1">Reviewed on: {formatDate(review.createdAt)}</p>
                      <p className="text-sm text-text-secondary mt-2">"{review.strengths[0].substring(0, 100)}..."</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-text-secondary">No resume reviews found. Try the Resume Reviewer!</p>
              )}
            </div>

            {/* Recent Behavioral Chats */}
            <div className="bg-surface/70 p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Recent Behavioral Chats</h2>
              {progress.chatSessions.length > 0 ? (
                <ul className="space-y-3">
                  {progress.chatSessions.map((session) => (
                    <li key={session._id} className="p-4 bg-background/50 rounded-md border border-text-secondary/20">
                      <p className="font-semibold text-text-primary">Chat Session from {formatDate(session.createdAt)}</p>
                      <p className="text-sm text-text-secondary mt-1">{session.messages.length} messages in this session.</p>
                      <p className="text-sm text-text-secondary mt-2 italic">"{session.messages[session.messages.length - 1].text.substring(0, 100)}..."</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-text-secondary">No chat sessions found. Try the Behavioral Coach!</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;