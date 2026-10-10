import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import "./index.css";

import RootProviders from "./components/RootProviders.jsx";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import BehavioralCoach from "./pages/BehavioralCoach.jsx";
import DsaArena from "./pages/DsaArena.jsx";
import ResumeReviewer from "./pages/ResumeReviewer.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

const router = createBrowserRouter([
    {
        element: <RootProviders />,
        children: [
            {
                path: "/",
                element: <Layout />,
                children: [
                    {
                        index: true,
                        element: <Dashboard />,
                    },
                    {
                        path: "dsa-arena",
                        element: <DsaArena />,
                    },
                    {
                        path: "behavioral-coach",
                        element: <BehavioralCoach />,
                    },
                    {
                        path: "resume-reviewer",
                        element: <ResumeReviewer />,
                    },
                    {
                        path: "profile",
                        element: <ProfilePage />,
                    },
                ],
            },
            {
                path: "/login/*",
                element: <LoginPage />,
            },
            {
                path: "/signup/*",
                element: <SignupPage />,
            },
        ],
    },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <RouterProvider router={router} />
    </React.StrictMode>
);