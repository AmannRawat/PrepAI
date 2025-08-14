// src/pages/Dashboard.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TypeAnimation } from 'react-type-animation';
import { Code, MessageSquare, FileText, ArrowRight } from 'lucide-react';

// A reusable card component for our features
const FeatureCard = ({ icon, title, description, path, navigate }) => {
  return (
    <div 
      className="bg-surface/70 p-6 rounded-lg shadow-lg border border-text-secondary/20
                 hover:border-accent hover:shadow-accent/20 transition-all duration-300
                 cursor-pointer flex flex-col"
      onClick={() => navigate(path)}
    >
      <div className="flex-1">
        <div className="mb-4">{icon}</div>
        <h3 className="text-xl font-bold text-text-primary mb-2">{title}</h3>
        <p className="text-text-secondary text-sm">{description}</p>
      </div>
      <div className="mt-6">
        <span className="text-accent font-semibold flex items-center group">
          Get Started <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </span>
      </div>
    </div>
  );
};


const Dashboard = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Code size={32} className="text-accent" />,
      title: "DSA Arena",
      description: "Sharpen your problem-solving skills with AI-generated DSA questions and get instant feedback on complexity and correctness.",
      path: "/dsa-arena"
    },
    {
      icon: <MessageSquare size={32} className="text-accent" />,
      title: "Behavioral Coach",
      description: "Practice responses to common behavioral questions and get AI-powered feedback on structure and clarity using the STAR method.",
      path: "/behavioral-coach"
    },
    {
      icon: <FileText size={32} className="text-accent" />,
      title: "Resume Reviewer",
      description: "Optimize your resume for ATS and human recruiters. Get feedback on action verbs, quantifiable achievements, and formatting.",
      path: "/resume-reviewer"
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center text-center h-full">
      {/* Animated Hero Section */}
      <div className="mb-16">
        <h1 className="text-6xl md:text-7xl font-bold text-accent font-mono mb-4">
          PrepAI
        </h1>
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
          repeat={Infinity}
        />
      </div>

      {/* Feature Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
        {features.map((feature, index) => (
          <FeatureCard key={index} {...feature} navigate={navigate} />
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
