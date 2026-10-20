import { createContext, useContext } from "react";
import { useAuth as useClerkAuth, useUser, useClerk } from "@clerk/react";

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

    const { signOut } = useClerk();

    const isLoaded = authLoaded && userLoaded;

    const login = async () => {
        return getToken();
    };

    const logout = async () => {
        await signOut();
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
        userId: user?.id || null,
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