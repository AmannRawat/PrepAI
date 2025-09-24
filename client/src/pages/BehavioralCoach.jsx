import { useState, useEffect, useRef } from 'react';
import { Send, LogOut, RefreshCw } from 'lucide-react'; // A nice icon for the send button
import axios from 'axios';

const BehavioralCoach = () => {
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
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startNewInterview = () => {
    setMessages([initialMessage]);
    setIsSessionOver(false);
  };

  // Function to handle the form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input); // Use a shared send message function
  };

  // Create a handler for the "End Interview" button
  const handleEndInterview = () => {
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
      // 2. Call the real backend API with the new chat history
      const response = await axios.post('http://localhost:8000/api/behavioral-chat', {
        messages: newMessageHistory,
      });

      let aiText = response.data.reply;
      if (aiText.includes("[SESSION_END]")) {
        aiText = aiText.replace("[SESSION_END]", "").trim(); // Clean the token from the text
        setIsSessionOver(true); // Set the session to over
      }
      const aiResponse = { sender: 'ai', text: aiText };

      //  Add the AI's response to the history
      setMessages(prev => [...prev, aiResponse]);

    } catch (error) {
      console.error("Error fetching AI response:", error);
      const errorResponse = { sender: 'ai', text: "Sorry, I'm having trouble connecting. Please try again." };
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