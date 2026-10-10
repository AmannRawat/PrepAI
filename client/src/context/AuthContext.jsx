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

    const value = {
        isLoaded,
        isLoggedIn: isLoaded && Boolean(isSignedIn),
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