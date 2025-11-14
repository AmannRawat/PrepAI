import { useState, useEffect, useRef } from 'react';
import { Send, LogOut, RefreshCw, Mic } from 'lucide-react';// A nice icon for the send button
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const BehavioralCoach = () => {
  const { token } = useAuth();
  const initialMessage = { sender: 'ai', text: "Hello! I'm your AI Behavioral Coach. To start, tell me about a time you had to work on a team." };
  // State to hold the conversation history
  const [messages, setMessages] = useState([initialMessage]);
  // State for the user's current input
  const [input, setInput] = useState('');
  // State to manage the loading indicator
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionOver, setIsSessionOver] = useState(false);
  // A ref to the message container to auto-scroll to the bottom
  const messagesEndRef = useRef(null);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  //  Helper function to make the browser speak ---
  const speak = (text) => {
    // Stop any speaking that is already in progress
    window.speechSynthesis.cancel();

    // Create a new speech "utterance"
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // Slightly slower for clarity

    // Tell the browser to speak it
    window.speechSynthesis.speak(utterance);
  };

  // Speak the initial message when the component loads ---
  useEffect(() => {
    speak(initialMessage.text);
  }, []); // The empty array [] means this runs only once on mount

  const startNewInterview = () => {
    window.speechSynthesis.cancel(); // Stop speaking
    setMessages([initialMessage]);
    setIsSessionOver(false);
    speak(initialMessage.text); // Speak the new greeting
  };

  // Function to handle the form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    window.speechSynthesis.cancel();
    sendMessage(input); // Use a shared send message function
  };

  // Create a handler for the "End Interview" button
  const handleEndInterview = () => {
    window.speechSynthesis.cancel(); // Stop speaking
    // Send our special action message to the backend
    sendMessage("USER_ACTION: End interview");
  };

  //  Create a shared function for sending messages
  const sendMessage = async (messageText) => {
    const userMessage = { sender: 'user', text: messageText };
    const newMessageHistory = [...messages, userMessage];

    // We only display the action message in the log if it's a real user message
    if (messageText !== "USER_ACTION: End interview") {
      setMessages(newMessageHistory);
      setInput('');
    }

    setIsLoading(true);

    try {
      // Call the real backend API with the new chat history
      const response = await axios.post('http://localhost:8000/api/behavioral-chat', {
        messages: newMessageHistory,
      }, {
        //  Add Authorization header
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      let aiText = response.data.reply;
      if (aiText.includes("[SESSION_END]")) {
        aiText = aiText.replace("[SESSION_END]", "").trim(); // Clean the token from the text
        setIsSessionOver(true); // Set the session to over
      }
      speak(aiText);
      const aiResponse = { sender: 'ai', text: aiText };

      //  Add the AI's response to the history
      // speak(errorResponse.text);
      setMessages(prev => [...prev, aiResponse]);

    } catch (err) {
      //  Add better error handling for auth 
      console.error("Error fetching AI response:", err);
      let errorResponse;
      if (err.response && err.response.status === 401) {
        errorResponse = { sender: 'ai', text: "Sorry, your session has expired. Please log in again." };
        //  logout() can also be called here
      } else {
        errorResponse = { sender: 'ai', text: "Sorry, I'm having trouble connecting. Please try again." };
      }
      speak(errorResponse.text);
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      // Stop the loading indicator
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full p-4 bg-surface/70 rounded-lg border border-text-secondary/20">
      <header className="mb-4">
        <h1 className="text-3xl font-bold text-text-primary">Behavioral Coach</h1>
        <p className="text-text-secondary">Practice common behavioral questions with your AI interviewer.</p>
      </header>

      {/* Message Display Area */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4">
        {messages.map((msg, index) => {
          if (msg.text === "USER_ACTION: End interview") return null;
          return (
            <div
              key={index}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xl p-3 rounded-lg whitespace-pre-wrap ${msg.sender === 'ai'
                  ? 'bg-background text-text-primary'
                  : 'bg-accent text-white'
                  }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-background text-text-primary p-3 rounded-lg">
              <span className="animate-pulse">AI is typing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* --- NEW --- Conditionally render the input form OR the "New Interview" button */}
      {!isSessionOver ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer here..."
            className="flex-1 p-3 bg-background text-text-primary rounded-lg border border-text-secondary/30 focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={isLoading}
          />
          <button type="submit" className="bg-accent p-3 rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50" disabled={isLoading || !input.trim()}>
            <Send size={24} />
          </button>
          <button
            type="button"
            onClick={handleEndInterview}
            title="End Interview & Get Summary"
            className="bg-red-600/80 p-3 rounded-lg text-white hover:bg-red-600 transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            <LogOut size={24} />
          </button>
        </form>
      ) : (
        <div className="flex justify-center items-center pt-4">
          <button
            onClick={startNewInterview}
            className="flex items-center gap-2 bg-accent text-white font-bold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity"
          >
            <RefreshCw size={20} />
            Start New Interview
          </button>
        </div>
      )}
    </div>
  );
};

export default BehavioralCoach;