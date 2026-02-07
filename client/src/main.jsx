import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css'
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
// Importing Layout and Page components
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BehavioralCoach from './pages/BehavioralCoach.jsx'; // We already built this one
import DsaArena from './pages/DsaArena.jsx';
import ResumeReviewer from './pages/ResumeReviewer.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import { ModalProvider } from './context/ModalContext.jsx';

// Define the application routes
const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />, // The Layout component wraps all pages
    children: [
      {
        index: true, // Making Dashboard the default page for "/"
        element: <Dashboard />
      },
      {
        path: "dsa-arena",
        element: <DsaArena />
      },
      {
        path: "behavioral-coach",
        element: <BehavioralCoach />
      },
      {
        path: "resume-reviewer",
        element: <ResumeReviewer />
      },
      {
        path: "profile",
        element: <ProfilePage />
      }
    ]
  },
  {
    path: "/login",
    element: <LoginPage /> // This route has NO sidebar
  },
  {
    path: "/signup",
    element: <SignupPage /> // This route has NO sidebar
  }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ModalProvider>
          <RouterProvider router={router} />
        </ModalProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
