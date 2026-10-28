import { Outlet, useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";

import { ThemeProvider } from "../context/ThemeContext.jsx";
import { AuthProvider } from "../context/AuthContext.jsx";
import { ModalProvider } from "../context/ModalContext.jsx";
import { getClerkAppearance } from "../utils/clerkTheme";

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
            appearance={getClerkAppearance()}
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