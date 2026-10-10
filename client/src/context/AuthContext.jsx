import { createContext, useContext } from "react";
import { useAuth as useClerkAuth, useUser, useClerk } from "@clerk/react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const {
        isSignedIn,
        getToken,
    } = useClerkAuth();

    const {
        user,
    } = useUser();

    const {
        signOut,
    } = useClerk();

    const login = async () => {
        // Authentication is now handled by Clerk.
        // Clerk automatically manages the session.
        return getToken();
    };

    const logout = async () => {
        await signOut();
    };

    const value = {
        isLoggedIn: !!isSignedIn,

        // Keep these names so existing components
        // using useAuth() don't immediately break.
        token: null,

        userEmail:
            user?.primaryEmailAddress?.emailAddress || null,

        userName:
            user?.fullName ||
            user?.firstName ||
            null,

        userId:
            user?.id || null,

        login,
        logout,

        // Expose Clerk's token getter for API requests.
        getToken,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};