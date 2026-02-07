import { useState, useEffect, useRef } from 'react';
import { Send, LogOut, RefreshCw, Mic, Volume2, VolumeX, PlayCircle, Settings, FileText, Upload, CheckCircle, Loader2, LogIn, AlertCircle } from 'lucide-react';// A nice icon for the send button
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const BehavioralCoach = () => {
  const { token, isLoggedIn } = useAuth();
  const { openLogin } = useModal();
  const navigate = useNavigate();
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
  const [activityRecorded, setActivityRecorded] = useState(false);
  const [showSetup, setShowSetup] = useState(true); // Shows the setup modal on load
  const [targetRole, setTargetRole] = useState('Software Engineer');
  const [targetCompany, setTargetCompany] = useState('Tech Company');
  const [useResume, setUseResume] = useState(isLoggedIn);

  //  Upload State 
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef(null); // Ref to trigger hidden file input

  const [isTtsEnabled, setIsTtsEnabled] = useState(() => {
    const saved = localStorage.getItem('isTtsEnabled');
    return saved !== null ? JSON.parse(saved) : true; // Default to true if not saved
  });
  useEffect(() => {
    localStorage.setItem('isTtsEnabled', JSON.stringify(isTtsEnabled));
  }, [isTtsEnabled]);

  useEffect(() => {
    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      const englishVoices = allVoices.filter(voice => voice.lang.includes('en-'));
      setVoices(englishVoices);

      // Try to find a high-quality default voice
      const premiumVoice = allVoices.find(
        (voice) => (voice.name.includes('Google') || voice.name.includes('Microsoft')) && voice.lang.includes('en-US')
      );

      if (premiumVoice) {
        setSelectedVoiceName(premiumVoice.name);
      } else if (englishVoices.length > 0) {
        // Find the first available US English voice
        const defaultVoice = englishVoices.find((voice) => voice.lang === 'en-US');
        setSelectedVoiceName(defaultVoice ? defaultVoice.name : englishVoices[0].name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  //  Helper function to make the browser speak ---
  const speak = (text) => {
    if (!isTtsEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    // Find the voice object that matches the selected name
    const selectedVoice = voices.find(voice => voice.name === selectedVoiceName);

    if (selectedVoice) {
      utterance.voice = selectedVoice; // Use the user's selected voice
    } else {
      utterance.lang = 'en-US'; // Fallback
    }

    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  // // Speak the initial message (only once voices are loaded)
  // useEffect(() => {
  //   if (voices.length > 0 && messages.length === 1) { // Only speak if voices are loaded and it's the first message
  //     speak(initialMessage.text);
  //   }
  // }, [voices, isTtsEnabled]); // Run when voices are ready


  // Auto-scroll to the bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  //  Update functions to cancel speech (prevents sound bugs)
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
  }
  // const startNewInterview = () => {
  //   stopSpeaking()// Stop speaking
  //   setMessages([initialMessage]);
  //   setIsSessionOver(false);
  //   speak(initialMessage.text); // Speak the new greeting
  //   setActivityRecorded(false);
  // };
  const startNewInterview = () => {
    stopSpeaking();
    setMessages([initialMessage]); // Reset to just the greeting
    setInput('');                  // Clear any typed text
    setIsSessionOver(false);       // Reset session flag
    setUploadSuccess(false);       // Reset upload checkmark
    setShowSetup(true);            // Re-open the setup modal
  };


  const handleFileUpload = async (e) => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file.");
      return;
    }

    setIsUploading(true);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      // We reuse the review endpoint. 
      // It saves the text to DB, which is what we need for the context.
      await axios.post(`${import.meta.env.VITE_API_URL}/api/review-resume`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      });

      setUploadSuccess(true);
      setUseResume(true); // Auto-enable the checkbox
    } catch (error) {
      console.error("Upload failed", error);
      if (error.response && error.response.data && error.response.data.error) {
        // This catches the "This is an assignment" error from the backend
        alert(`Upload Failed: ${error.response.data.error}`);
      } else {
        alert("Failed to upload resume. Please try again.");
      }
      // Reset the file input so they can try again
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsUploading(false);
    }
  };

  // Function to handle the form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    stopSpeaking();
    // Wake up audio on mobile
    if (isTtsEnabled) {
      const silentUtterance = new SpeechSynthesisUtterance(" ");
      window.speechSynthesis.speak(silentUtterance);
    }
    sendMessage(input); // Use a shared send message function
  };

  // Create a handler for the "End Interview" button
  const handleEndInterview = () => {
    stopSpeaking(); // Stop speaking
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
      const config = isLoggedIn && token
        ? { headers: { 'Authorization': `Bearer ${token}` } }
        : {};
      // Call the real backend API with the new chat history
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/behavioral-chat`, {
        messages: newMessageHistory,
        //  Sending Setup Data to Backend
        targetRole: targetRole,
        targetCompany: targetCompany,
        useResumeContext: useResume
      }, 
        //  Add Authorization header
        // headers: {
        //   'Authorization': `Bearer ${token}`
        // }
        config
      );

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

      // Record this activity for the daily streak
      // We only do this ONCE per session, on the first successful message
      if (!activityRecorded && messageText !== "USER_ACTION: End interview") {
        axios.post(`${import.meta.env.VITE_API_URL}/api/user/record-activity`, {}, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(() => {
          setActivityRecorded(true); // Mark as recorded for this session
        }).catch(err => {
          console.error("Failed to record activity:", err);
        });
      }
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
    <div className="flex flex-col flex-1 h-[85vh] md:h-full p-4 pt-4 bg-surface/70 rounded-lg border border-text-secondary/20 relative">

      {/* SETUP MODAL OVERLAY */}
      {showSetup && (
        <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 rounded-lg">
          <div className="bg-surface border border-accent/30 p-6 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-bold text-accent mb-4 text-center">Interview Setup</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Target Role</label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Frontend Developer"
                  className="w-full p-2 bg-background border border-text-secondary/30 rounded focus:border-accent outline-none text-text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Target Company</label>
                <input
                  type="text"
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  placeholder="e.g. Google, Amazon"
                  className="w-full p-2 bg-background border border-text-secondary/30 rounded focus:border-accent outline-none text-text-primary"
                />
              </div>

              {/* <--- NEW: Conditional Resume Section */}
              <div className="bg-background/50 p-3 rounded border border-text-secondary/20">
                {isLoggedIn ? (
                    // OPTION A: LOGGED IN USER (See Upload)
                    <>
                        <div className="flex items-center justify-between mb-2">
                           <label className="flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={useResume} 
                                onChange={(e) => setUseResume(e.target.checked)}
                                className="form-checkbox h-5 w-5 text-accent rounded bg-surface border-text-secondary/50"
                              />
                              <span className="ml-2 text-text-primary font-medium">Use Resume Context</span>
                           </label>
                        </div>
                        
                        <p className="text-xs text-text-secondary mb-3">
                          Uses your uploaded resume to personalize questions.
                        </p>

                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".pdf" 
                            onChange={handleFileUpload}
                        />

                        <button 
                          onClick={() => fileInputRef.current.click()}
                          disabled={isUploading}
                          className="w-full py-2 border border-dashed border-accent/50 rounded flex items-center justify-center gap-2 text-xs text-accent hover:bg-accent/10 transition-colors"
                        >
                          {isUploading ? (
                              <> <Loader2 size={14} className="animate-spin" /> Uploading...</>
                          ) : uploadSuccess ? (
                              <> <CheckCircle size={14} /> Resume Updated!</>
                          ) : (
                              <> <Upload size={14} /> Upload New Resume (PDF)</>
                          )}
                        </button>
                    </>
                ) : (
                    // OPTION B: GUEST USER (See Login CTA)
                    <div className="text-center py-2">
                        <div className="flex items-center justify-center gap-2 text-text-secondary mb-2 opacity-50">
                            <input type="checkbox" disabled checked={false} />
                            <span className="font-medium">Use Resume Context</span>
                        </div>
                        <p className="text-xs text-text-secondary mb-3">
                            Log in to upload your resume and get personalized questions based on your experience.
                        </p>
                        <button 
                            onClick={openLogin}
                            className="w-full py-2 bg-accent/10 border border-accent/30 text-accent rounded flex items-center justify-center gap-2 text-sm font-bold hover:bg-accent hover:text-white transition-colors"
                        >
                            <LogIn size={16} /> Log In to Personalize
                        </button>
                    </div>
                )}
              </div>

              <button
                onClick={() => {
                  setShowSetup(false);
                  speak(`Okay, I'm ready to interview you for the ${targetRole} position at ${targetCompany}.`);
                }}
                className="w-full bg-accent hover:bg-accent-darker text-white font-bold py-3 rounded-lg transition-colors mt-2"
              >
                Start Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="mb-4">
        {/* <--- NEW: GUEST BANNER */}
        {!isLoggedIn && (
            <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-2 rounded-md mb-3 text-sm text-center flex items-center justify-center gap-2">
                <AlertCircle size={16} />
                <span>Guest Mode: Chat history will not be saved. <button onClick={openLogin} className="underline font-bold hover:text-blue-300">Log In</button></span>
            </div>
        )}

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Behavioral Coach</h1>
            <p className="text-text-secondary text-sm">
              Role: <span className="text-accent">{targetRole}</span> | Company: <span className="text-accent">{targetCompany}</span>
            </p>
          </div>
          <button onClick={() => setShowSetup(true)} className="p-2 text-text-secondary hover:text-accent">
            <Settings size={20} />
          </button>
        </div>

        <div className="flex justify-end mt-2">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-text-secondary" />
            <select
              value={selectedVoiceName}
              onChange={(e) => setSelectedVoiceName(e.target.value)}
              className="bg-surface text-text-primary rounded px-2 py-1 border border-text-secondary/30 text-xs max-w-[120px]"
            >
              <option value="">Default Voice</option>
              {voices.map(voice => (
                <option key={voice.name} value={voice.name}>
                  {voice.name.substring(0, 15)}...
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const newState = !isTtsEnabled;
                setIsTtsEnabled(newState);
                if (!newState) stopSpeaking();
              }}
              className="p-1 rounded border border-text-secondary/30 text-text-secondary hover:text-text-primary"
            >
              {isTtsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4">
        {messages.map((msg, index) => {
          if (msg.text === "USER_ACTION: End interview") return null;
          return (
            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} group`}>
              <div className={`max-w-xl p-3 rounded-lg whitespace-pre-wrap relative ${msg.sender === 'ai' ? 'bg-background text-text-primary' : 'bg-accent text-white'}`}>
                {msg.text}
                {msg.sender === 'ai' && (
                  <button
                    onClick={() => speak(msg.text)}
                    className="absolute -right-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-secondary hover:text-accent p-1"
                  >
                    <PlayCircle size={20} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-background text-text-primary p-3 rounded-lg"><span className="animate-pulse">AI is typing...</span></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!isSessionOver ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-4 mb-16 md:mb-0">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your answer..." className="flex-1 p-3 bg-background text-text-primary rounded-lg border border-text-secondary/30 focus:outline-none focus:ring-2 focus:ring-accent" disabled={isLoading} />
          <button type="submit" className="bg-accent p-3 rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50" disabled={isLoading || !input.trim()}><Send size={24} /></button>
          <button type="button" onClick={handleEndInterview} className="bg-red-600/80 p-3 rounded-lg text-white hover:bg-red-600 transition-colors disabled:opacity-50" disabled={isLoading}><LogOut size={24} /></button>
        </form>
      ) : (
        <div className="flex justify-center items-center pt-4">
          <button onClick={startNewInterview} className="flex items-center gap-2 bg-accent text-white font-bold py-3 px-6 rounded-lg hover:opacity-90 transition-opacity"><RefreshCw size={20} /> Start New Interview</button>
        </div>
      )}
    </div>
  );
};

export default BehavioralCoach;