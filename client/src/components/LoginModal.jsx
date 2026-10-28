import { SignIn } from "@clerk/react";
import { useModal } from "../context/ModalContext";
import { X } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import PepeAvatar from "./PepeAvatar";
import { getClerkAppearance } from "../utils/clerkTheme";

const LoginModal = () => {
    const { isLoginOpen, closeLogin } = useModal();
    const { isLoaded, isLoggedIn } = useAuth();

    useEffect(() => {
        if (isLoaded && isLoggedIn) {
            closeLogin();
        }
    }, [isLoaded, isLoggedIn, closeLogin]);

    // If the modal is not open, don't render anything.
    if (!isLoginOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) closeLogin();
            }}
        >
            <div className="relative w-full max-w-[420px] bg-surface rounded-2xl shadow-2xl shadow-black/80 border border-white/10 pt-6 px-6 pb-4 sm:pt-7 sm:px-7 sm:pb-5 max-h-[92vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                    onClick={closeLogin}
                    className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors p-1.5 rounded-lg hover:bg-white/5 active:scale-95 z-10"
                    aria-label="Close login"
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center mb-5">
                    <div className="relative mb-2.5 flex items-center justify-center">
                        <div className="absolute inset-0 bg-accent/20 rounded-full blur-md scale-110" />
                        <PepeAvatar size="lg" className="relative drop-shadow-md" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
                        Welcome back to PrepAI
                    </h2>
                    <p className="text-xs sm:text-sm text-text-secondary mt-1 max-w-xs leading-relaxed">
                        Your AI-powered interview preparation companion.
                    </p>
                </div>

                <SignIn
                    routing="hash"
                    signUpUrl="/signup"
                    fallbackRedirectUrl="/"
                    appearance={getClerkAppearance()}
                />
            </div>
        </div>
    );
};

export default LoginModal;