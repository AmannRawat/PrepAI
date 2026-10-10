import { SignUp } from "@clerk/react";

const SignupPage = () => {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <SignUp
                routing="path"
                path="/signup"
                signInUrl="/login"
                fallbackRedirectUrl="/"
            />
        </div>
    );
};

export default SignupPage;