import { createContext, useContext, useEffect } from "react";
import { useAuth as useClerkAuth, useUser, useClerk } from "@clerk/react";
import { identifyUser, resetUser } from "../utils/analytics.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const {
        isLoaded: authLoaded,
        isSignedIn,
        getToken,
    } = useClerkAuth();

    const {
        isLoaded: userLoaded,
        user,
    } = useUser();

    const clerk = useClerk();

    const isLoaded = authLoaded && userLoaded;

    useEffect(() => {
        if (!isLoaded) return;

        if (isSignedIn && user?.id) {
            identifyUser(user.id);
        } else if (!isSignedIn) {
            resetUser();
        }
    }, [isLoaded, isSignedIn, user?.id]);

    const login = async () => {
        return getToken();
    };

    const logout = async () => {
        resetUser();
        await clerk.signOut();
    };

    const openUserProfile = () => {
        if (typeof clerk?.openUserProfile === 'function') {
            clerk.openUserProfile();
        }
    };

    // Do not render the application until Clerk has finished
    // determining the current authentication state.
    //
    // Without this guard, the application can briefly render
    // the logged-out UI before Clerk finishes loading and then
    // switch to the logged-in UI.
    if (!isLoaded) {
        return (
            <div className="min-h-screen bg-background text-text-primary flex items-center justify-center">
                <div className="text-sm text-text-secondary">
                    Loading PrepAI...
                </div>
            </div>
        );
    }

    const value = {
        isLoaded,
        isLoggedIn: Boolean(isSignedIn),
        token: null,
        userEmail: user?.primaryEmailAddress?.emailAddress || null,
        userName: user?.fullName || user?.firstName || null,
        userImageUrl: user?.imageUrl || null,
        userId: user?.id || null,
        openUserProfile,
        login,
        logout,
        getToken,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);