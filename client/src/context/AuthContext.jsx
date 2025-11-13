import { createContext, useContext, useState } from 'react';
// import { useNavigate } from 'react-router-dom';

// Context
const AuthContext = createContext();

// AuthProvider component
export const AuthProvider = ({ children }) => {
    // Initialize state by reading from localStorage
    // This makes sure we stay logged in even after a page refresh
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [userEmail, setUserEmail] = useState(localStorage.getItem('userEmail'));
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
    const [userName, setUserName] = useState(localStorage.getItem('userName'));
    // const navigate = useNavigate();

    // Login function
    const login = (data) => {
        // Saves data to localStorage
        localStorage.setItem('token', data.token);
        localStorage.setItem('userEmail', data.email);
        localStorage.setItem('userName', data.name);
        // Update the state
        setToken(data.token);
        setUserEmail(data.email);
        setUserName(data.name);
        setIsLoggedIn(true);

        // Redirect to the dashboard
        // navigate('/'); // Navigation will be handled by the component that calls this
    };

    // Logout function
    const logout = () => {
        // Clear data from localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');

        // Reset the state
        setToken(null);
        setUserEmail(null);
        setUserName(null);
        setIsLoggedIn(false);

        // Redirects to the login page
        // navigate('/login'); // Navigation will be handled by the component that calls this
    };

    // Pass the values to all children
    const value = {
        isLoggedIn,
        token,
        userEmail,
        userName,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook to use the context
export const useAuth = () => {
    return useContext(AuthContext);
};