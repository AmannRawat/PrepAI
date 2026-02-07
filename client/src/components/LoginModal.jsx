import { useModal } from "../context/ModalContext";
import LoginForm from "./LoginForm"; 
import { X } from "lucide-react"; 

const LoginModal = () => {
  const { isLoginOpen, closeLogin } = useModal();

  if (!isLoginOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      
      <div className="relative w-full max-w-md p-6 bg-surface rounded-2xl shadow-2xl border border-white/10">
        
        <button 
          onClick={closeLogin} 
          className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors z-10"
        >
          <X size={24} />
        </button>
        
        <LoginForm onSuccess={closeLogin} isModal={true} />

      </div>
    </div>
  );
};

export default LoginModal;