// importing useNavigate hook from react-router-dom
// helps me navigate to different pages programmatically
import { useNavigate } from 'react-router-dom';

// importing TypeAnimation component to show animated typing text
import { TypeAnimation } from 'react-type-animation';

// importing icons from lucide-react library (basically a set of SVG icons as React components)
import { Code, MessageSquare, FileText, ArrowRight } from 'lucide-react';

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

  // features array - storing data for each feature
  // instead of writing 3 FeatureCards manually, I will map over this array
  const features = [
    {
      // icon component with size + color class
      icon: <Code size={24} className="text-accent" />,
      title: "DSA Arena",
      description: "Sharpen your problem-solving skills with AI-generated DSA questions and get instant feedback on complexity and correctness.",
      path: "/dsa-arena"
    },
    {
      icon: <MessageSquare size={24} className="text-accent" />,
      title: "Behavioral Coach",
      description: "Practice responses to common behavioral questions and get AI-powered feedback on structure and clarity using the STAR method.",
      path: "/behavioral-coach"
    },
    {
      icon: <FileText size={24} className="text-accent" />,
      title: "Resume Reviewer",
      description: "Optimize your resume for ATS and human recruiters. Get feedback on action verbs, quantifiable achievements, and formatting.",
      path: "/resume-reviewer"
    }
  ];

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
