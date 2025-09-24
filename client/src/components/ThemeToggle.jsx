
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full bg-surface hover:opacity-80 transition-opacity"
      title="Toggle theme"
    >
      {theme === 'vintage' ? (
        <Moon className="text-text-secondary" />
      ) : (
        <Sun className="text-text-secondary" />
      )}
    </button>
  );
};

export default ThemeToggle;