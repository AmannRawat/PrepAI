import sys
import os

# Ensure app can be imported
sys.path.insert(0, os.path.dirname(__file__))

from app.agents.interview_graph import compute_adaptive_difficulty, DIFFICULTY_LEVELS

def test_adaptive_difficulty_transitions():
    print("Testing compute_adaptive_difficulty...")
    
    # 1. HARDER transitions
    assert compute_adaptive_difficulty("Easy", "HARDER") == "Medium", "Easy + HARDER -> Medium"
    assert compute_adaptive_difficulty("Medium", "HARDER") == "Hard", "Medium + HARDER -> Hard"
    assert compute_adaptive_difficulty("Hard", "HARDER") == "Hard", "Hard + HARDER -> Hard (clamped)"
    
    # 2. EASIER transitions
    assert compute_adaptive_difficulty("Hard", "EASIER") == "Medium", "Hard + EASIER -> Medium"
    assert compute_adaptive_difficulty("Medium", "EASIER") == "Easy", "Medium + EASIER -> Easy"
    assert compute_adaptive_difficulty("Easy", "EASIER") == "Easy", "Easy + EASIER -> Easy (clamped)"
    
    # 3. SIMILAR transitions
    assert compute_adaptive_difficulty("Easy", "SIMILAR") == "Easy", "Easy + SIMILAR -> Easy"
    assert compute_adaptive_difficulty("Medium", "SIMILAR") == "Medium", "Medium + SIMILAR -> Medium"
    assert compute_adaptive_difficulty("Hard", "SIMILAR") == "Hard", "Hard + SIMILAR -> Hard"
    
    # 4. Fallback on invalid inputs
    assert compute_adaptive_difficulty("Invalid", "HARDER") == "Hard", "Invalid fallback to Medium + HARDER -> Hard"
    assert compute_adaptive_difficulty(None, "EASIER") == "Easy", "None fallback to Medium + EASIER -> Easy"
    assert compute_adaptive_difficulty("medium", "HARDER") == "Hard", "Case-insensitive medium -> Hard"
    
    print("All compute_adaptive_difficulty tests passed successfully!")

if __name__ == "__main__":
    test_adaptive_difficulty_transitions()
