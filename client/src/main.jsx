import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css'

import { ThemeProvider } from './context/ThemeContext.jsx';
// Importing Layout and Page components
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BehavioralCoach from './pages/BehavioralCoach.jsx'; // We already built this one
import DsaArena from './pages/DsaArena.jsx';
import ResumeReviewer from './pages/ResumeReviewer.jsx';

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
      }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
)
