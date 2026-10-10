import { Outlet, useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";

import { ThemeProvider } from "../context/ThemeContext.jsx";
import { AuthProvider } from "../context/AuthContext.jsx";
import { ModalProvider } from "../context/ModalContext.jsx";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
    throw new Error(
        "Missing VITE_CLERK_PUBLISHABLE_KEY in the client environment."
    );
}

const RootProviders = () => {
    const navigate = useNavigate();

    return (
        <ClerkProvider
            publishableKey={clerkPublishableKey}
            routerPush={(to) => navigate(to)}
            routerReplace={(to) => navigate(to, { replace: true })}
            signInUrl="/login"
            signUpUrl="/signup"
            signInFallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/"
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
                        <Outlet />
                    </ModalProvider>
                </AuthProvider>
            </ThemeProvider>
        </ClerkProvider>
    );
};

export default RootProviders;