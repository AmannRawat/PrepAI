import { SignIn } from "@clerk/react";
import PepeAvatar from "../components/PepeAvatar";
import { getClerkAppearance } from "../utils/clerkTheme";

const LoginPage = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 sm:p-6">
            <div className="relative w-full max-w-[420px] bg-surface rounded-2xl shadow-2xl shadow-black/80 border border-white/10 p-6 sm:p-7">
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
                    routing="path"
                    path="/login"
                    signUpUrl="/signup"
                    fallbackRedirectUrl="/"
                    appearance={getClerkAppearance()}
                />
            </div>
        </div>
    );
};

export default LoginPage;