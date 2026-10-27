import os
import sys
import unittest

# Ensure app can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.agents.interview_graph import compute_adaptive_difficulty, DIFFICULTY_LEVELS


class TestAdaptiveDifficulty(unittest.TestCase):

    def test_adaptive_difficulty_transitions(self):
        # 1. HARDER transitions
        self.assertEqual(compute_adaptive_difficulty("Easy", "HARDER"), "Medium")
        self.assertEqual(compute_adaptive_difficulty("Medium", "HARDER"), "Hard")
        self.assertEqual(compute_adaptive_difficulty("Hard", "HARDER"), "Hard")

        # 2. EASIER transitions
        self.assertEqual(compute_adaptive_difficulty("Hard", "EASIER"), "Medium")
        self.assertEqual(compute_adaptive_difficulty("Medium", "EASIER"), "Easy")
        self.assertEqual(compute_adaptive_difficulty("Easy", "EASIER"), "Easy")

        # 3. SIMILAR transitions
        self.assertEqual(compute_adaptive_difficulty("Easy", "SIMILAR"), "Easy")
        self.assertEqual(compute_adaptive_difficulty("Medium", "SIMILAR"), "Medium")
        self.assertEqual(compute_adaptive_difficulty("Hard", "SIMILAR"), "Hard")

        # 4. Fallback on invalid inputs
        self.assertEqual(compute_adaptive_difficulty("Invalid", "HARDER"), "Hard")
        self.assertEqual(compute_adaptive_difficulty(None, "EASIER"), "Easy")
        self.assertEqual(compute_adaptive_difficulty("medium", "HARDER"), "Hard")


if __name__ == "__main__":
    unittest.main()
