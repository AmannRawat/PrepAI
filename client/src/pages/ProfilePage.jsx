// client/src/pages/ProfilePage.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Loader2 } from 'lucide-react'; // For loading spinner

const ProfilePage = () => {
  const { userEmail, token } = useAuth();
  const [progress, setProgress] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // This useEffect runs once when the component loads
  useEffect(() => {
    const fetchProgress = async () => {
      if (!token) {
        setIsLoading(false);
        setError("No token found. Please log in again.");
        return;
      }

      try {
        // 1. Fetch data from our new protected endpoint
        const response = await axios.get('http://localhost:8000/api/user/progress', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        setProgress(response.data); // Save the { resumeReviews, chatSessions } object
      } catch (err) {
        console.error("Error fetching progress:", err);
        setError("Failed to load progress. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProgress();
  }, [token]); // Re-run if the token changes

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
        <p className="text-text-secondary">Welcome, {userEmail}</p>
      </header>
      
      {/* --- Main Content Area --- */}
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
            {/* Recent Resume Reviews */}
            <div className="bg-surface/70 p-6 rounded-lg">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Recent Resume Reviews</h2>
              {progress.resumeReviews.length > 0 ? (
                <ul className="space-y-3">
                  {progress.resumeReviews.map((review) => (
                    <li key={review._id} className="p-4 bg-background/50 rounded-md border border-text-secondary/20">
                      <p className="font-semibold text-accent">ATS Score: {review.atsAssessment?.estimatedScore || 'N/A'} / 100</p>
                      <p className="text-sm text-text-secondary mt-1">Reviewed on: {formatDate(review.createdAt)}</p>
                      <p className="text-sm text-text-secondary mt-2">"{review.strengths.substring(0, 100)}..."</p>
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