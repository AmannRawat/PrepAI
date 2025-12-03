// import useNavigate hook from react-router-dom
// helps me navigate to different pages programmatically
import { useNavigate } from 'react-router-dom';
// import TypeAnimation component to show animated typing text
import { TypeAnimation } from 'react-type-animation';
// import icons from lucide-react library (basically a set of SVG icons as React components)
import { Code, MessageSquare, FileText, ArrowRight } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react'; // React hooks
import { useAuth } from '../context/AuthContext';    // Auth context
import axios from 'axios';
// FeatureCard component -> this is reusable, will show each feature card (DSA, Behavioral, Resume)
// I am using props: icon, title, description, path, and navigate (passed from parent)
const FeatureCard = ({ icon, title, description, path, navigate }) => {
  return (
    // main card container
    // using Tailwind classes for styling: bg, padding, rounded corners, border, shadow, hover effects etc.
    <div
      className="group bg-surface/70 p-6 rounded-lg border border-text-secondary/20
                 hover:border-accent transition-all duration-300
                 cursor-pointer flex flex-col relative overflow-hidden
                 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
      // when card is clicked → navigate to the path of that feature
      onClick={() => navigate(path)}
    >
      {/* background glow effect when hovered */}
      <div className="absolute -inset-px rounded-lg bg-gradient-to-r from-accent to-accent-darker 
                      opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md"></div>

      {/* main content wrapper - z-10 so it stays above glow */}
      <div className="relative z-10 flex flex-col flex-1">
        <div className="flex-1">
          {/* icon wrapper (circle background for the icon) */}
          <div className="mb-4 w-12 h-12 bg-background rounded-full flex items-center justify-center">
            {icon}
          </div>
          {/* feature title */}
          <h3 className="text-xl font-bold text-text-primary mb-2 font-serif">{title}</h3>
          {/* feature description */}
          <p className="text-text-secondary text-sm">{description}</p>
        </div>
        {/* bottom section with "Get Started" link + arrow */}
        <div className="mt-6">
          <span className="text-accent font-semibold flex items-center">
            Get Started
            {/* arrow icon with hover animation (moves slightly right) */}
            <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </span>
        </div>
      </div>
    </div>
  );
};

// main Dashboard component
const Dashboard = () => {
  // useNavigate hook gives me a function to change route
  const navigate = useNavigate();
  // Get auth state and set up state for progress data
  const { userName, token } = useAuth(); // Get user's name and token
  const [progress, setProgress] = useState(null); // Will hold fetched data
  const [isLoading, setIsLoading] = useState(true);
  // base feature definitions removed — descriptions are generated dynamically below via useMemo

  // useEffect to fetch user progress data when component mounts
  useEffect(() => {
    const fetchProgress = async () => {
      if (!token) {
        setIsLoading(false);
        return; // No token, no data to fetch
      }
      try {
        // Call the endpoint we built to get all user data
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/user/progress`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setProgress(response.data); // Save the data {dsaSubmissions, resumeReviews, ...}
      } catch (err) {
        console.error("Failed to fetch progress", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProgress();
  }, [token]); // This effect runs once the token is available

  // Use of useMemo to dynamically create the feature descriptions
  // This array will be built with default text, and then automatically
  // update once the 'progress' data arrives from our fetch.
  const features = useMemo(() => {
    // Helper to format dates, you can move this outside if you want
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString();

    // Find the most recent activity for each category
    const lastDsa = progress?.dsaSubmissions?.[0];
    const lastReview = progress?.resumeReviews?.[0];
    const lastChat = progress?.chatSessions?.[0];

    // Create dynamic descriptions based on the fetched data
    const dsaDesc = lastDsa
      ? `Last attempt: ${lastDsa.problem.title} on ${formatDate(lastDsa.createdAt)}`
      : "Sharpen your problem-solving skills with AI-generated DSA questions...";
    
    const resumeDesc = lastReview
      ? `Last Score: ${lastReview.atsAssessment.estimatedScore}/100 on ${formatDate(lastReview.createdAt)}`
      : "Optimize your resume for ATS and human recruiters...";

    const chatDesc = lastChat
      ? `Last session: ${formatDate(lastChat.createdAt)} (${lastChat.messages.length} messages)`
      : "Practice responses to common behavioral questions...";

    // Return the final array for our cards
    return [
      {
        icon: <Code size={24} className="text-accent" />,
        title: "DSA Arena",
        description: dsaDesc,
        path: "/dsa-arena"
      },
      {
        icon: <MessageSquare size={24} className="text-accent" />,
        title: "Behavioral Coach",
        description: chatDesc,
        path: "/behavioral-coach"
      },
      {
        icon: <FileText size={24} className="text-accent" />,
        title: "Resume Reviewer",
        description: resumeDesc,
        path: "/resume-reviewer"
      }
    ];
  }, [progress]); // This hook re-runs only when the 'progress' state changes

  // return jsx of dashboard
  return (
    <div className="flex flex-col items-center justify-center text-center h-full">
      {/* header section */}
      <div className="mb-16">
        {/* big heading */}
        <h1 className="text-6xl md:text-7xl font-bold text-accent font-serif mb-4">
          PrepAI
        </h1>
        {/* typing animation under the heading */}
        <TypeAnimation
          sequence={[
            '> Your AI Interview Co-Pilot', 2000,
            '> Sharpen Your DSA Skills', 2000,
            '> Ace Your Behavioral Round', 2000,
            '> Land Your Dream Job', 2000,
          ]}
          wrapper="span"
          speed={50}
          className="text-xl md:text-2xl text-text-secondary font-mono"
          repeat={Infinity} // keep looping infinitely
        />
        <h2 className="text-2xl text-text-primary mt-12">
          Welcome, <span className="text-accent">{userName || 'User'}</span>!
        </h2>
        {/* <p className="text-text-secondary">
          {isLoading ? "Loading your recent activity..." : "Here's your latest progress:"}
        </p> */}
      </div>

      {/* feature cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
        {/* looping through features array and rendering FeatureCard for each */}
        {features.map((feature, index) => (
          <FeatureCard key={index} {...feature} navigate={navigate} />
        ))}
      </div>
    </div>
  );
};

// exporting Dashboard component so it can be used in other files
export default Dashboard;