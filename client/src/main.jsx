import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";

import "./index.css";

import { ThemeProvider } from "./context/ThemeContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ModalProvider } from "./context/ModalContext.jsx";

import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import BehavioralCoach from "./pages/BehavioralCoach.jsx";
import DsaArena from "./pages/DsaArena.jsx";
import ResumeReviewer from "./pages/ResumeReviewer.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
    throw new Error(
        "Missing VITE_CLERK_PUBLISHABLE_KEY in the client environment."
    );
}

const router = createBrowserRouter([
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
        path: "/login",
        element: <LoginPage />,
    },
    {
        path: "/signup",
        element: <SignupPage />,
    },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <ClerkProvider
            publishableKey={clerkPublishableKey}
            appearance={{
                variables: {
                    colorPrimary: "var(--color-accent)",
                    colorPrimaryForeground: "var(--color-background)",
                    colorBackground: "var(--color-surface)",
                    colorForeground: "var(--color-text-primary)",
                    colorMutedForeground: "var(--color-text-secondary)",
                    colorInput: "var(--color-background)",
                    colorInputForeground: "var(--color-text-primary)",
                    colorBorder: "var(--color-text-secondary)",
                    colorRing: "var(--color-accent)",
                    fontFamily: "Inter, sans-serif",
                    borderRadius: "0.75rem",
                },
                elements: {
                    rootBox: {
                        width: "100%",
                    },
                    card: {
                        backgroundColor: "var(--color-surface)",
                        boxShadow: "none",
                        border: "1px solid var(--color-text-secondary)",
                    },
                    headerTitle: {
                        color: "var(--color-text-primary)",
                    },
                    headerSubtitle: {
                        color: "var(--color-text-secondary)",
                    },
                    formFieldLabel: {
                        color: "var(--color-text-secondary)",
                    },
                    formFieldInput: {
                        backgroundColor: "var(--color-background)",
                        color: "var(--color-text-primary)",
                        borderColor: "var(--color-text-secondary)",
                    },
                    formButtonPrimary: {
                        backgroundColor: "var(--color-accent)",
                        color: "var(--color-background)",
                    },
                    socialButtonsBlockButton: {
                        backgroundColor: "var(--color-background)",
                        color: "var(--color-text-primary)",
                        borderColor: "var(--color-text-secondary)",
                    },
                    dividerText: {
                        color: "var(--color-text-secondary)",
                    },
                    footer: {
                        backgroundColor: "var(--color-surface)",
                    },
                    footerAction: {
                        backgroundColor: "var(--color-surface)",
                    },
                    footerActionText: {
                        color: "var(--color-text-secondary)",
                    },
                    footerActionLink: {
                        color: "var(--color-accent)",
                    },
                },
            }}
        >
            <ThemeProvider>
                <AuthProvider>
                    <ModalProvider>
                        <RouterProvider router={router} />
                    </ModalProvider>
                </AuthProvider>
            </ThemeProvider>
        </ClerkProvider>
    </React.StrictMode>
);