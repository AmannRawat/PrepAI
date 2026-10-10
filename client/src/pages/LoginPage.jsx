import { SignIn } from "@clerk/react";

const LoginPage = () => {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <SignIn
                routing="path"
                path="/login"
                signUpUrl="/signup"
                fallbackRedirectUrl="/"
            />
        </div>
    );
};

export default LoginPage;