/**
 * PrepAI DSA Blueprints Library
 * 
 * Provides an extensible collection of algorithmically verified problem blueprints.
 * Each blueprint defines:
 * - Algorithmic contract, parameters, return types, and constraints
 * - Trusted reference solution in JavaScript
 * - Matching boilerplates for JavaScript, Python, Java, and C++
 * - Deterministic test generator with edge cases
 * - Independent trusted oracle for calculating 100% correct expected outputs
 * - Pre-verified canonical baseline problem specification
 */

export const TOPIC_ROTATION_ORDER = [
  "Arrays",
  "Strings",
  "Hash Map",
  "Two Pointers",
  "Binary Search",
  "Stack",
  "Intervals",
  "Trees",
  "Graphs",
  "Dynamic Programming",
];

export const DSA_BLUEPRINTS = [
  // 1. Arrays & Prefix Sums
  {
    id: "arrays-pivot-index",
    topic: "Arrays",
    pattern: "Prefix Sums",
    difficulty: "Easy",
    title: "Find Pivot Index",
    functionName: "findPivotIndex",
    parameterNames: ["nums"],
    description:
      "Given an array of integers nums, calculate the pivot index of this array.\n\nThe pivot index is the index where the sum of all the numbers strictly to the left of the index is equal to the sum of all the numbers strictly to the index's right.\n\nIf the index is on the left edge of the array, then the left sum is 0 because there are no elements to the left. This also applies to the right edge of the array.\n\nReturn the leftmost pivot index. If no such index exists, return -1.",
    constraints: [
      "1 <= nums.length <= 10^4",
      "-1000 <= nums[i] <= 1000",
    ],
    examples: [
      {
        input: "nums = [1, 7, 3, 6, 5, 6]",
        output: "3",
        explanation: "The pivot index is 3. Left sum = nums[0] + nums[1] + nums[2] = 1 + 7 + 3 = 11. Right sum = nums[4] + nums[5] = 5 + 6 = 11.",
      },
      {
        input: "nums = [1, 2, 3]",
        output: "-1",
        explanation: "There is no index that satisfies the conditions in the problem statement.",
      },
    ],
    boilerplates: {
      javascript: "function findPivotIndex(nums) {\n  // Write your code here\n}",
      python: "def findPivotIndex(nums):\n    pass",
      java: "class Solution {\n    public int findPivotIndex(int[] nums) {\n        // Write your code here\n        return -1;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int findPivotIndex(vector<int>& nums) {\n        // Write your code here\n        return -1;\n    }\n};",
    },
    referenceSolution: {
      code: "function findPivotIndex(nums) {\n  if (!Array.isArray(nums) || nums.length === 0) return -1;\n  let totalSum = 0;\n  for (let i = 0; i < nums.length; i++) {\n    totalSum += nums[i];\n  }\n  let leftSum = 0;\n  for (let i = 0; i < nums.length; i++) {\n    if (leftSum === totalSum - leftSum - nums[i]) {\n      return i;\n    }\n    leftSum += nums[i];\n  }\n  return -1;\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
    oracle: (input) => {
      const nums = input.nums;
      if (!Array.isArray(nums) || nums.length === 0) return -1;
      for (let i = 0; i < nums.length; i++) {
        let left = 0;
        for (let l = 0; l < i; l++) left += nums[l];
        let right = 0;
        for (let r = i + 1; r < nums.length; r++) right += nums[r];
        if (left === right) return i;
      }
      return -1;
    },
    baselineTestCases: [
      { input: { nums: [1, 7, 3, 6, 5, 6] }, expectedOutput: 3, isHidden: false },
      { input: { nums: [1, 2, 3] }, expectedOutput: -1, isHidden: false },
      { input: { nums: [2, 1, -1] }, expectedOutput: 0, isHidden: true },
      { input: { nums: [0, 0, 0] }, expectedOutput: 0, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { nums: [1, 7, 3, 6, 5, 6] }, isHidden: false },
      { input: { nums: [1, 2, 3] }, isHidden: false },
      { input: { nums: [2, 1, -1] }, isHidden: true },
      { input: { nums: [100, -50, -50, 0] }, isHidden: true },
    ],
  },

  // 1b. Arrays - Maximum Subarray (Medium)
  {
    id: "arrays-maximum-subarray",
    topic: "Arrays",
    pattern: "Kadane's Algorithm",
    difficulty: "Medium",
    title: "Maximum Subarray Sum",
    functionName: "maxSubArray",
    parameterNames: ["nums"],
    description:
      "Given an integer array nums, find the subarray with the largest sum, and return its sum.\n\nA subarray is a contiguous non-empty sequence of elements within an array.",
    constraints: [
      "1 <= nums.length <= 10^5",
      "-10^4 <= nums[i] <= 10^4",
    ],
    examples: [
      {
        input: "nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]",
        output: "6",
        explanation: "The subarray [4, -1, 2, 1] has the largest sum 6.",
      },
      {
        input: "nums = [1]",
        output: "1",
        explanation: "The subarray [1] has the largest sum 1.",
      },
      {
        input: "nums = [5, 4, -1, 7, 8]",
        output: "23",
        explanation: "The subarray [5, 4, -1, 7, 8] has the largest sum 23.",
      },
    ],
    boilerplates: {
      javascript: "function maxSubArray(nums) {\n  // Write your code here\n}",
      python: "def maxSubArray(nums):\n    pass",
      java: "class Solution {\n    public int maxSubArray(int[] nums) {\n        // Write your code here\n        return 0;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int maxSubArray(vector<int>& nums) {\n        // Write your code here\n        return 0;\n    }\n};",
    },
    referenceSolution: {
      code: "function maxSubArray(nums) {\n  if (!Array.isArray(nums) || nums.length === 0) return 0;\n  let maxSoFar = nums[0];\n  let curr = nums[0];\n  for (let i = 1; i < nums.length; i++) {\n    curr = Math.max(nums[i], curr + nums[i]);\n    maxSoFar = Math.max(maxSoFar, curr);\n  }\n  return maxSoFar;\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
    oracle: (input) => {
      const { nums } = input;
      if (!Array.isArray(nums) || nums.length === 0) return 0;
      let maxSoFar = nums[0];
      let curr = nums[0];
      for (let i = 1; i < nums.length; i++) {
        curr = Math.max(nums[i], curr + nums[i]);
        maxSoFar = Math.max(maxSoFar, curr);
      }
      return maxSoFar;
    },
    baselineTestCases: [
      { input: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] }, expectedOutput: 6, isHidden: false },
      { input: { nums: [1] }, expectedOutput: 1, isHidden: false },
      { input: { nums: [5, 4, -1, 7, 8] }, expectedOutput: 23, isHidden: true },
      { input: { nums: [-1] }, expectedOutput: -1, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] }, isHidden: false },
      { input: { nums: [1] }, isHidden: false },
      { input: { nums: [5, 4, -1, 7, 8] }, isHidden: true },
      { input: { nums: [-5, -2, -8, -1] }, isHidden: true },
    ],
  },

  // 2. Hash Map - Pair Sum Target
  {
    id: "hashmap-pair-sum",
    topic: "Hash Map",
    pattern: "Frequency Map",
    difficulty: "Easy",
    title: "Pair Sum Target",
    functionName: "pairSumTarget",
    parameterNames: ["nums", "target"],
    description:
      "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have at most one solution, and you may not use the same element twice.\n\nReturn the two indices sorted in ascending order [i, j]. If no valid pair exists, return an empty array [].",
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "-10^9 <= target <= 10^9",
    ],
    examples: [
      {
        input: "nums = [2, 7, 11, 15], target = 9",
        output: "[0, 1]",
        explanation: "Because nums[0] + nums[1] == 9, we return [0, 1].",
      },
      {
        input: "nums = [3, 2, 4], target = 6",
        output: "[1, 2]",
        explanation: "Because nums[1] + nums[2] == 6, we return [1, 2].",
      },
    ],
    boilerplates: {
      javascript: "function pairSumTarget(nums, target) {\n  // Write your code here\n}",
      python: "def pairSumTarget(nums, target):\n    pass",
      java: "class Solution {\n    public int[] pairSumTarget(int[] nums, int target) {\n        // Write your code here\n        return new int[]{};\n    }\n}",
      cpp: "class Solution {\npublic:\n    vector<int> pairSumTarget(vector<int>& nums, int target) {\n        // Write your code here\n        return {};\n    }\n};",
    },
    referenceSolution: {
      code: "function pairSumTarget(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    },
    oracle: (input) => {
      const { nums, target } = input;
      for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          if (nums[i] + nums[j] === target) return [i, j];
        }
      }
      return [];
    },
    baselineTestCases: [
      { input: { nums: [2, 7, 11, 15], target: 9 }, expectedOutput: [0, 1], isHidden: false },
      { input: { nums: [3, 2, 4], target: 6 }, expectedOutput: [1, 2], isHidden: false },
      { input: { nums: [3, 3], target: 6 }, expectedOutput: [0, 1], isHidden: true },
      { input: { nums: [1, 2, 3], target: 10 }, expectedOutput: [], isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { nums: [2, 7, 11, 15], target: 9 }, isHidden: false },
      { input: { nums: [3, 2, 4], target: 6 }, isHidden: false },
      { input: { nums: [3, 3], target: 6 }, isHidden: true },
      { input: { nums: [-3, 4, 3, 90], target: 0 }, isHidden: true },
    ],
  },

  // 3. Two Pointers - Container With Most Water
  {
    id: "twopointers-water-container",
    topic: "Two Pointers",
    pattern: "Two Pointers",
    difficulty: "Medium",
    title: "Container With Most Water",
    functionName: "maxWaterContainer",
    parameterNames: ["heights"],
    description:
      "You are given an integer array heights of length n. There are n vertical lines drawn such that the two endpoints of the ith line are (i, 0) and (i, heights[i]).\n\nFind two lines that together with the x-axis form a container, such that the container contains the most water.\n\nReturn the maximum amount of water a container can store. Notice that you may not slant the container.",
    constraints: [
      "2 <= heights.length <= 10^5",
      "0 <= heights[i] <= 10^4",
    ],
    examples: [
      {
        input: "heights = [1, 8, 6, 2, 5, 4, 8, 3, 7]",
        output: "49",
        explanation: "The vertical lines are at indices 1 and 8 with heights 8 and 7. The distance between them is 7, so the area is min(8, 7) * 7 = 49.",
      },
      {
        input: "heights = [1, 1]",
        output: "1",
        explanation: "The max area is min(1, 1) * 1 = 1.",
      },
    ],
    boilerplates: {
      javascript: "function maxWaterContainer(heights) {\n  // Write your code here\n}",
      python: "def maxWaterContainer(heights):\n    pass",
      java: "class Solution {\n    public int maxWaterContainer(int[] heights) {\n        // Write your code here\n        return 0;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int maxWaterContainer(vector<int>& heights) {\n        // Write your code here\n        return 0;\n    }\n};",
    },
    referenceSolution: {
      code: "function maxWaterContainer(heights) {\n  if (!Array.isArray(heights) || heights.length < 2) return 0;\n  let maxArea = 0;\n  let left = 0;\n  let right = heights.length - 1;\n  while (left < right) {\n    const h = Math.min(heights[left], heights[right]);\n    const w = right - left;\n    const area = h * w;\n    if (area > maxArea) maxArea = area;\n    if (heights[left] < heights[right]) {\n      left++;\n    } else {\n      right--;\n    }\n  }\n  return maxArea;\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
    oracle: (input) => {
      const heights = input.heights;
      let maxArea = 0;
      for (let i = 0; i < heights.length; i++) {
        for (let j = i + 1; j < heights.length; j++) {
          const area = Math.min(heights[i], heights[j]) * (j - i);
          if (area > maxArea) maxArea = area;
        }
      }
      return maxArea;
    },
    baselineTestCases: [
      { input: { heights: [1, 8, 6, 2, 5, 4, 8, 3, 7] }, expectedOutput: 49, isHidden: false },
      { input: { heights: [1, 1] }, expectedOutput: 1, isHidden: false },
      { input: { heights: [4, 3, 2, 1, 4] }, expectedOutput: 16, isHidden: true },
      { input: { heights: [1, 2, 1] }, expectedOutput: 2, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { heights: [1, 8, 6, 2, 5, 4, 8, 3, 7] }, isHidden: false },
      { input: { heights: [1, 1] }, isHidden: false },
      { input: { heights: [4, 3, 2, 1, 4] }, isHidden: true },
      { input: { heights: [2, 3, 4, 5, 18, 17, 6] }, isHidden: true },
    ],
  },

  // 4. Strings & Sliding Window - Longest Substring Without Repeating
  {
    id: "strings-longest-unique-substr",
    topic: "Strings",
    pattern: "Sliding Window",
    difficulty: "Medium",
    title: "Longest Unique Substring Length",
    functionName: "longestUniqueSubstring",
    parameterNames: ["s"],
    description:
      "Given a string s, find the length of the longest substring without duplicate characters.\n\nA substring is a contiguous non-empty sequence of characters within a string.",
    constraints: [
      "0 <= s.length <= 5 * 10^4",
      "s consists of English letters, digits, symbols and spaces.",
    ],
    examples: [
      {
        input: "s = \"abcabcbb\"",
        output: "3",
        explanation: "The answer is \"abc\", with the length of 3.",
      },
      {
        input: "s = \"bbbbb\"",
        output: "1",
        explanation: "The answer is \"b\", with the length of 1.",
      },
    ],
    boilerplates: {
      javascript: "function longestUniqueSubstring(s) {\n  // Write your code here\n}",
      python: "def longestUniqueSubstring(s):\n    pass",
      java: "class Solution {\n    public int longestUniqueSubstring(String s) {\n        // Write your code here\n        return 0;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int longestUniqueSubstring(string s) {\n        // Write your code here\n        return 0;\n    }\n};",
    },
    referenceSolution: {
      code: "function longestUniqueSubstring(s) {\n  if (!s || typeof s !== 'string') return 0;\n  let maxLen = 0;\n  let left = 0;\n  const charMap = new Map();\n  for (let right = 0; right < s.length; right++) {\n    const char = s[right];\n    if (charMap.has(char) && charMap.get(char) >= left) {\n      left = charMap.get(char) + 1;\n    }\n    charMap.set(char, right);\n    const currentLen = right - left + 1;\n    if (currentLen > maxLen) maxLen = currentLen;\n  }\n  return maxLen;\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(min(n, m))",
    },
    oracle: (input) => {
      const s = input.s || "";
      let maxLen = 0;
      for (let i = 0; i < s.length; i++) {
        const seen = new Set();
        for (let j = i; j < s.length; j++) {
          if (seen.has(s[j])) break;
          seen.add(s[j]);
          if (j - i + 1 > maxLen) maxLen = j - i + 1;
        }
      }
      return maxLen;
    },
    baselineTestCases: [
      { input: { s: "abcabcbb" }, expectedOutput: 3, isHidden: false },
      { input: { s: "bbbbb" }, expectedOutput: 1, isHidden: false },
      { input: { s: "pwwkew" }, expectedOutput: 3, isHidden: true },
      { input: { s: "" }, expectedOutput: 0, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { s: "abcabcbb" }, isHidden: false },
      { input: { s: "bbbbb" }, isHidden: false },
      { input: { s: "pwwkew" }, isHidden: true },
      { input: { s: "aab" }, isHidden: true },
    ],
  },

  // 5. Binary Search - Rotated Array Search
  {
    id: "binarysearch-rotated-array",
    topic: "Binary Search",
    pattern: "Binary Search",
    difficulty: "Medium",
    title: "Search in Rotated Sorted Array",
    functionName: "searchRotatedArray",
    parameterNames: ["nums", "target"],
    description:
      "There is an integer array nums sorted in ascending order (with distinct values).\n\nPrior to being passed to your function, nums is possibly rotated at an unknown pivot index k (1 <= k < nums.length). For example, [0,1,2,4,5,6,7] might become [4,5,6,7,0,1,2].\n\nGiven the array nums after the possible rotation and an integer target, return the index of target if it is in nums, or -1 if it is not in nums.\n\nYou must write an algorithm with O(log n) runtime complexity.",
    constraints: [
      "1 <= nums.length <= 5000",
      "-10^4 <= nums[i] <= 10^4",
      "All values of nums are unique.",
    ],
    examples: [
      {
        input: "nums = [4, 5, 6, 7, 0, 1, 2], target = 0",
        output: "4",
        explanation: "0 is located at index 4.",
      },
      {
        input: "nums = [4, 5, 6, 7, 0, 1, 2], target = 3",
        output: "-1",
        explanation: "3 does not exist in nums, so return -1.",
      },
    ],
    boilerplates: {
      javascript: "function searchRotatedArray(nums, target) {\n  // Write your code here\n}",
      python: "def searchRotatedArray(nums, target):\n    pass",
      java: "class Solution {\n    public int searchRotatedArray(int[] nums, int target) {\n        // Write your code here\n        return -1;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int searchRotatedArray(vector<int>& nums, int target) {\n        // Write your code here\n        return -1;\n    }\n};",
    },
    referenceSolution: {
      code: "function searchRotatedArray(nums, target) {\n  if (!Array.isArray(nums) || nums.length === 0) return -1;\n  let low = 0;\n  let high = nums.length - 1;\n  while (low <= high) {\n    const mid = Math.floor((low + high) / 2);\n    if (nums[mid] === target) return mid;\n    if (nums[low] <= nums[mid]) {\n      if (nums[low] <= target && target < nums[mid]) {\n        high = mid - 1;\n      } else {\n        low = mid + 1;\n      }\n    } else {\n      if (nums[mid] < target && target <= nums[high]) {\n        low = mid + 1;\n      } else {\n        high = mid - 1;\n      }\n    }\n  }\n  return -1;\n}",
      timeComplexity: "O(log n)",
      spaceComplexity: "O(1)",
    },
    oracle: (input) => {
      const { nums, target } = input;
      return nums.indexOf(target);
    },
    baselineTestCases: [
      { input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 0 }, expectedOutput: 4, isHidden: false },
      { input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 3 }, expectedOutput: -1, isHidden: false },
      { input: { nums: [1], target: 0 }, expectedOutput: -1, isHidden: true },
      { input: { nums: [3, 1], target: 1 }, expectedOutput: 1, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 0 }, isHidden: false },
      { input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 3 }, isHidden: false },
      { input: { nums: [1], target: 1 }, isHidden: true },
      { input: { nums: [5, 1, 3], target: 5 }, isHidden: true },
    ],
  },

  // 6. Stack - Valid Brackets
  {
    id: "stack-balanced-brackets",
    topic: "Stack",
    pattern: "Balanced Stack",
    difficulty: "Easy",
    title: "Valid Parentheses and Brackets",
    functionName: "isBalancedBrackets",
    parameterNames: ["s"],
    description:
      "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.",
    constraints: [
      "1 <= s.length <= 10^4",
      "s consists of parentheses only '()[]{}'.",
    ],
    examples: [
      {
        input: "s = \"()\"",
        output: "true",
        explanation: "The parentheses match and close in proper order.",
      },
      {
        input: "s = \"()[]{}\"",
        output: "true",
        explanation: "All types of brackets match correctly.",
      },
    ],
    boilerplates: {
      javascript: "function isBalancedBrackets(s) {\n  // Write your code here\n}",
      python: "def isBalancedBrackets(s):\n    pass",
      java: "class Solution {\n    public boolean isBalancedBrackets(String s) {\n        // Write your code here\n        return false;\n    }\n}",
      cpp: "class Solution {\npublic:\n    bool isBalancedBrackets(string s) {\n        // Write your code here\n        return false;\n    }\n};",
    },
    referenceSolution: {
      code: "function isBalancedBrackets(s) {\n  if (typeof s !== 'string') return false;\n  const stack = [];\n  const map = { ')': '(', '}': '{', ']': '[' };\n  for (let i = 0; i < s.length; i++) {\n    const char = s[i];\n    if (char === '(' || char === '{' || char === '[') {\n      stack.push(char);\n    } else if (map[char]) {\n      if (stack.pop() !== map[char]) {\n        return false;\n      }\n    }\n  }\n  return stack.length === 0;\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    },
    oracle: (input) => {
      let str = input.s || "";
      let prevLen = -1;
      while (str.length !== prevLen) {
        prevLen = str.length;
        str = str.replace("()", "").replace("[]", "").replace("{}", "");
      }
      return str.length === 0;
    },
    baselineTestCases: [
      { input: { s: "()" }, expectedOutput: true, isHidden: false },
      { input: { s: "()[]{}" }, expectedOutput: true, isHidden: false },
      { input: { s: "(]" }, expectedOutput: false, isHidden: true },
      { input: { s: "{[]}" }, expectedOutput: true, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { s: "()" }, isHidden: false },
      { input: { s: "()[]{}" }, isHidden: false },
      { input: { s: "([)]" }, isHidden: true },
      { input: { s: "]" }, isHidden: true },
    ],
  },

  // 7. Intervals & Greedy - Merge Overlapping Intervals
  {
    id: "intervals-merge-ranges",
    topic: "Intervals",
    pattern: "Interval Merging",
    difficulty: "Medium",
    title: "Merge Overlapping Intervals",
    functionName: "mergeIntervalRanges",
    parameterNames: ["intervals"],
    description:
      "Given an array of intervals where intervals[i] = [start_i, end_i], merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.\n\nThe returned list must be sorted in ascending order of interval start times.",
    constraints: [
      "1 <= intervals.length <= 10^4",
      "intervals[i].length == 2",
      "0 <= start_i <= end_i <= 10^4",
    ],
    examples: [
      {
        input: "intervals = [[1, 3], [2, 6], [8, 10], [15, 18]]",
        output: "[[1, 6], [8, 10], [15, 18]]",
        explanation: "Since intervals [1, 3] and [2, 6] overlap, merge them into [1, 6].",
      },
      {
        input: "intervals = [[1, 4], [4, 5]]",
        output: "[[1, 5]]",
        explanation: "Intervals [1, 4] and [4, 5] are considered overlapping.",
      },
    ],
    boilerplates: {
      javascript: "function mergeIntervalRanges(intervals) {\n  // Write your code here\n}",
      python: "def mergeIntervalRanges(intervals):\n    pass",
      java: "class Solution {\n    public int[][] mergeIntervalRanges(int[][] intervals) {\n        // Write your code here\n        return new int[][]{};\n    }\n}",
      cpp: "class Solution {\npublic:\n    vector<vector<int>> mergeIntervalRanges(vector<vector<int>>& intervals) {\n        // Write your code here\n        return {};\n    }\n};",
    },
    referenceSolution: {
      code: "function mergeIntervalRanges(intervals) {\n  if (!Array.isArray(intervals) || intervals.length <= 1) return intervals || [];\n  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);\n  const merged = [sorted[0]];\n  for (let i = 1; i < sorted.length; i++) {\n    const current = sorted[i];\n    const last = merged[merged.length - 1];\n    if (current[0] <= last[1]) {\n      last[1] = Math.max(last[1], current[1]);\n    } else {\n      merged.push(current);\n    }\n  }\n  return merged;\n}",
      timeComplexity: "O(n log n)",
      spaceComplexity: "O(n)",
    },
    oracle: (input) => {
      const intervals = input.intervals || [];
      if (intervals.length <= 1) return intervals;
      const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
      const res = [[...sorted[0]]];
      for (let i = 1; i < sorted.length; i++) {
        const top = res[res.length - 1];
        if (sorted[i][0] <= top[1]) {
          top[1] = Math.max(top[1], sorted[i][1]);
        } else {
          res.push([...sorted[i]]);
        }
      }
      return res;
    },
    baselineTestCases: [
      { input: { intervals: [[1, 3], [2, 6], [8, 10], [15, 18]] }, expectedOutput: [[1, 6], [8, 10], [15, 18]], isHidden: false },
      { input: { intervals: [[1, 4], [4, 5]] }, expectedOutput: [[1, 5]], isHidden: false },
      { input: { intervals: [[1, 4], [0, 4]] }, expectedOutput: [[0, 4]], isHidden: true },
      { input: { intervals: [[1, 2]] }, expectedOutput: [[1, 2]], isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { intervals: [[1, 3], [2, 6], [8, 10], [15, 18]] }, isHidden: false },
      { input: { intervals: [[1, 4], [4, 5]] }, isHidden: false },
      { input: { intervals: [[6, 8], [1, 9], [2, 4], [4, 7]] }, isHidden: true },
      { input: { intervals: [[1, 4], [2, 3]] }, isHidden: true },
    ],
  },

  // 8. Trees - Maximum Depth of Binary Tree
  {
    id: "trees-max-binary-depth",
    topic: "Trees",
    pattern: "Tree Traversal",
    difficulty: "Easy",
    title: "Maximum Depth of Binary Tree",
    functionName: "maxBinaryTreeDepth",
    parameterNames: ["treeNodes"],
    description:
      "Given the root of a binary tree represented as an array of level-order values (where null represents an absent node), return its maximum depth.\n\nA binary tree's maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node.",
    constraints: [
      "The number of nodes in the tree is in the range [0, 10^4].",
      "-100 <= Node.val <= 100",
    ],
    examples: [
      {
        input: "treeNodes = [3, 9, 20, null, null, 15, 7]",
        output: "3",
        explanation: "The longest path is 3 -> 20 -> 15 (or 7), which has depth 3.",
      },
      {
        input: "treeNodes = [1, null, 2]",
        output: "2",
        explanation: "Root 1 has a right child 2, giving depth 2.",
      },
    ],
    boilerplates: {
      javascript: "function maxBinaryTreeDepth(treeNodes) {\n  // Write your code here\n}",
      python: "def maxBinaryTreeDepth(treeNodes):\n    pass",
      java: "class Solution {\n    public int maxBinaryTreeDepth(Integer[] treeNodes) {\n        // Write your code here\n        return 0;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int maxBinaryTreeDepth(vector<int> treeNodes) {\n        // Write your code here\n        return 0;\n    }\n};",
    },
    referenceSolution: {
      code: "function maxBinaryTreeDepth(treeNodes) {\n  if (!Array.isArray(treeNodes) || treeNodes.length === 0 || treeNodes[0] == null) return 0;\n  function getDepth(index) {\n    if (index >= treeNodes.length || treeNodes[index] == null) return 0;\n    const leftDepth = getDepth(2 * index + 1);\n    const rightDepth = getDepth(2 * index + 2);\n    return 1 + Math.max(leftDepth, rightDepth);\n  }\n  return getDepth(0);\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(h)",
    },
    oracle: (input) => {
      const arr = input.treeNodes;
      if (!Array.isArray(arr) || arr.length === 0 || arr[0] == null) return 0;
      const dfs = (i) => {
        if (i >= arr.length || arr[i] == null) return 0;
        return 1 + Math.max(dfs(2 * i + 1), dfs(2 * i + 2));
      };
      return dfs(0);
    },
    baselineTestCases: [
      { input: { treeNodes: [3, 9, 20, null, null, 15, 7] }, expectedOutput: 3, isHidden: false },
      { input: { treeNodes: [1, null, 2] }, expectedOutput: 2, isHidden: false },
      { input: { treeNodes: [] }, expectedOutput: 0, isHidden: true },
      { input: { treeNodes: [0] }, expectedOutput: 1, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { treeNodes: [3, 9, 20, null, null, 15, 7] }, isHidden: false },
      { input: { treeNodes: [1, null, 2] }, isHidden: false },
      { input: { treeNodes: [1, 2, 3, 4, null, null, 5] }, isHidden: true },
      { input: { treeNodes: [] }, isHidden: true },
    ],
  },

  // 9. Graphs - Shortest Path in Binary Grid
  {
    id: "graphs-grid-shortest-path",
    topic: "Graphs",
    pattern: "BFS Traversal",
    difficulty: "Medium",
    title: "Shortest Path in Binary Grid",
    functionName: "shortestPathBinaryGrid",
    parameterNames: ["grid"],
    description:
      "Given an n x n binary matrix grid, return the length of the shortest clear path in the matrix.\n\nA clear path in a binary matrix is a path from the top-left cell (0, 0) to the bottom-right cell (n - 1, n - 1) such that:\n- All visited cells of the path are 0.\n- All adjacent cells of the path are 4-directionally connected (up, down, left, right).\n\nThe length of a clear path is the number of visited cells of this path. If there is no clear path, return -1.",
    constraints: [
      "n == grid.length == grid[i].length",
      "1 <= n <= 100",
      "grid[i][j] is 0 or 1",
    ],
    examples: [
      {
        input: "grid = [[0, 0], [1, 0]]",
        output: "3",
        explanation: "The shortest path is (0,0) -> (0,1) -> (1,1), which visits 3 cells.",
      },
      {
        input: "grid = [[0, 1], [1, 0]]",
        output: "-1",
        explanation: "No 4-directionally clear path exists to reach (1,1).",
      },
    ],
    boilerplates: {
      javascript: "function shortestPathBinaryGrid(grid) {\n  // Write your code here\n}",
      python: "def shortestPathBinaryGrid(grid):\n    pass",
      java: "class Solution {\n    public int shortestPathBinaryGrid(int[][] grid) {\n        // Write your code here\n        return -1;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int shortestPathBinaryGrid(vector<vector<int>>& grid) {\n        // Write your code here\n        return -1;\n    }\n};",
    },
    referenceSolution: {
      code: "function shortestPathBinaryGrid(grid) {\n  if (!Array.isArray(grid) || grid.length === 0 || grid[0].length === 0) return -1;\n  const n = grid.length;\n  const m = grid[0].length;\n  if (grid[0][0] !== 0 || grid[n - 1][m - 1] !== 0) return -1;\n  if (n === 1 && m === 1) return 1;\n  const queue = [[0, 0, 1]];\n  const visited = new Set(['0,0']);\n  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];\n  while (queue.length > 0) {\n    const [r, c, d] = queue.shift();\n    if (r === n - 1 && c === m - 1) return d;\n    for (const [dr, dc] of dirs) {\n      const nr = r + dr;\n      const nc = c + dc;\n      const key = `${nr},${nc}`;\n      if (nr >= 0 && nr < n && nc >= 0 && nc < m && grid[nr][nc] === 0 && !visited.has(key)) {\n        visited.add(key);\n        queue.push([nr, nc, d + 1]);\n      }\n    }\n  }\n  return -1;\n}",
      timeComplexity: "O(n * m)",
      spaceComplexity: "O(n * m)",
    },
    oracle: (input) => {
      const grid = input.grid;
      const n = grid.length;
      const m = grid[0].length;
      if (grid[0][0] !== 0 || grid[n - 1][m - 1] !== 0) return -1;
      if (n === 1 && m === 1) return 1;
      const q = [{ r: 0, c: 0, steps: 1 }];
      const seen = new Set(["0,0"]);
      const moves = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      while (q.length) {
        const { r, c, steps } = q.shift();
        if (r === n - 1 && c === m - 1) return steps;
        for (const [dr, dc] of moves) {
          const nr = r + dr, nc = c + dc;
          const k = `${nr},${nc}`;
          if (nr >= 0 && nr < n && nc >= 0 && nc < m && grid[nr][nc] === 0 && !seen.has(k)) {
            seen.add(k);
            q.push({ r: nr, c: nc, steps: steps + 1 });
          }
        }
      }
      return -1;
    },
    baselineTestCases: [
      { input: { grid: [[0, 0], [1, 0]] }, expectedOutput: 3, isHidden: false },
      { input: { grid: [[0, 1], [1, 0]] }, expectedOutput: -1, isHidden: false },
      { input: { grid: [[0]] }, expectedOutput: 1, isHidden: true },
      { input: { grid: [[0, 0, 0], [1, 1, 0], [1, 1, 0]] }, expectedOutput: 5, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { grid: [[0, 0], [1, 0]] }, isHidden: false },
      { input: { grid: [[0, 1], [1, 0]] }, isHidden: false },
      { input: { grid: [[0]] }, isHidden: true },
      { input: { grid: [[0, 0, 0, 0], [1, 1, 0, 1], [0, 0, 0, 0], [0, 1, 1, 0]] }, isHidden: true },
    ],
  },

  // 10. Dynamic Programming - Climbing Stairs
  {
    id: "dp-climbing-stairs",
    topic: "Dynamic Programming",
    pattern: "Linear DP",
    difficulty: "Easy",
    title: "Climbing Stairs Ways",
    functionName: "climbStairsWays",
    parameterNames: ["n"],
    description:
      "You are climbing a staircase. It takes n steps to reach the top.\n\nEach time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?",
    constraints: [
      "1 <= n <= 45",
    ],
    examples: [
      {
        input: "n = 2",
        output: "2",
        explanation: "There are two ways to climb to the top: 1 step + 1 step, or 2 steps.",
      },
      {
        input: "n = 3",
        output: "3",
        explanation: "There are three ways: 1+1+1, 1+2, or 2+1.",
      },
    ],
    boilerplates: {
      javascript: "function climbStairsWays(n) {\n  // Write your code here\n}",
      python: "def climbStairsWays(n):\n    pass",
      java: "class Solution {\n    public int climbStairsWays(int n) {\n        // Write your code here\n        return 0;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int climbStairsWays(int n) {\n        // Write your code here\n        return 0;\n    }\n};",
    },
    referenceSolution: {
      code: "function climbStairsWays(n) {\n  if (n <= 2) return n;\n  let prev2 = 1;\n  let prev1 = 2;\n  for (let i = 3; i <= n; i++) {\n    const current = prev1 + prev2;\n    prev2 = prev1;\n    prev1 = current;\n  }\n  return prev1;\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
    oracle: (input) => {
      const n = input.n;
      if (n <= 2) return n;
      const dp = [0, 1, 2];
      for (let i = 3; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
      return dp[n];
    },
    baselineTestCases: [
      { input: { n: 2 }, expectedOutput: 2, isHidden: false },
      { input: { n: 3 }, expectedOutput: 3, isHidden: false },
      { input: { n: 1 }, expectedOutput: 1, isHidden: true },
      { input: { n: 5 }, expectedOutput: 8, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { n: 2 }, isHidden: false },
      { input: { n: 3 }, isHidden: false },
      { input: { n: 4 }, isHidden: true },
      { input: { n: 6 }, isHidden: true },
    ],
  },

  // 11. Dynamic Programming - Coin Change Minimum
  {
    id: "dp-coin-change",
    topic: "Dynamic Programming",
    pattern: "Unbounded Knapsack",
    difficulty: "Medium",
    title: "Minimum Coin Change",
    functionName: "minCoinsForAmount",
    parameterNames: ["coins", "amount"],
    description:
      "You are given an integer array coins representing coins of different denominations and an integer amount representing a total amount of money.\n\nReturn the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1.\n\nYou may assume that you have an infinite number of each kind of coin.",
    constraints: [
      "1 <= coins.length <= 12",
      "1 <= coins[i] <= 2^31 - 1",
      "0 <= amount <= 10^4",
    ],
    examples: [
      {
        input: "coins = [1, 2, 5], amount = 11",
        output: "3",
        explanation: "11 = 5 + 5 + 1 (3 coins).",
      },
      {
        input: "coins = [2], amount = 3",
        output: "-1",
        explanation: "Amount 3 cannot be formed with only coins of denomination 2.",
      },
    ],
    boilerplates: {
      javascript: "function minCoinsForAmount(coins, amount) {\n  // Write your code here\n}",
      python: "def minCoinsForAmount(coins, amount):\n    pass",
      java: "class Solution {\n    public int minCoinsForAmount(int[] coins, int amount) {\n        // Write your code here\n        return -1;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int minCoinsForAmount(vector<int>& coins, int amount) {\n        // Write your code here\n        return -1;\n    }\n};",
    },
    referenceSolution: {
      code: "function minCoinsForAmount(coins, amount) {\n  if (amount === 0) return 0;\n  if (!Array.isArray(coins) || coins.length === 0) return -1;\n  const dp = new Array(amount + 1).fill(Infinity);\n  dp[0] = 0;\n  for (let i = 1; i <= amount; i++) {\n    for (let c = 0; c < coins.length; c++) {\n      const coin = coins[c];\n      if (i - coin >= 0 && dp[i - coin] !== Infinity) {\n        dp[i] = Math.min(dp[i], dp[i - coin] + 1);\n      }\n    }\n  }\n  return dp[amount] === Infinity ? -1 : dp[amount];\n}",
      timeComplexity: "O(amount * coins.length)",
      spaceComplexity: "O(amount)",
    },
    oracle: (input) => {
      const { coins, amount } = input;
      if (amount === 0) return 0;
      const memo = {};
      const solve = (rem) => {
        if (rem < 0) return -1;
        if (rem === 0) return 0;
        if (memo[rem] !== undefined) return memo[rem];
        let min = Infinity;
        for (const c of coins) {
          const res = solve(rem - c);
          if (res >= 0 && res < min) min = res + 1;
        }
        memo[rem] = min === Infinity ? -1 : min;
        return memo[rem];
      };
      return solve(amount);
    },
    baselineTestCases: [
      { input: { coins: [1, 2, 5], amount: 11 }, expectedOutput: 3, isHidden: false },
      { input: { coins: [2], amount: 3 }, expectedOutput: -1, isHidden: false },
      { input: { coins: [1], amount: 0 }, expectedOutput: 0, isHidden: true },
      { input: { coins: [2, 5, 10, 1], amount: 27 }, expectedOutput: 4, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { coins: [1, 2, 5], amount: 11 }, isHidden: false },
      { input: { coins: [2], amount: 3 }, isHidden: false },
      { input: { coins: [1], amount: 0 }, isHidden: true },
      { input: { coins: [1, 3, 4], amount: 6 }, isHidden: true },
    ],
  },

  // 12. Heap / Frequency - Top K Frequent Elements
  {
    id: "heap-top-k-frequent",
    topic: "Hash Map",
    pattern: "Frequency Sorting",
    difficulty: "Medium",
    title: "Top K Frequent Elements",
    functionName: "topKFrequentElements",
    parameterNames: ["nums", "k"],
    description:
      "Given an integer array nums and an integer k, return the k most frequent elements.\n\nTo ensure consistent ordering, return the result sorted in ascending order. It is guaranteed that the answer is unique.",
    constraints: [
      "1 <= nums.length <= 10^5",
      "-10^4 <= nums[i] <= 10^4",
      "k is in the range [1, the number of unique elements in the array].",
    ],
    examples: [
      {
        input: "nums = [1, 1, 1, 2, 2, 3], k = 2",
        output: "[1, 2]",
        explanation: "1 appears 3 times, 2 appears 2 times. The top 2 frequent elements are 1 and 2.",
      },
      {
        input: "nums = [1], k = 1",
        output: "[1]",
        explanation: "1 appears 1 time.",
      },
    ],
    boilerplates: {
      javascript: "function topKFrequentElements(nums, k) {\n  // Write your code here\n}",
      python: "def topKFrequentElements(nums, k):\n    pass",
      java: "class Solution {\n    public int[] topKFrequentElements(int[] nums, int k) {\n        // Write your code here\n        return new int[]{};\n    }\n}",
      cpp: "class Solution {\npublic:\n    vector<int> topKFrequentElements(vector<int>& nums, int k) {\n        // Write your code here\n        return {};\n    }\n};",
    },
    referenceSolution: {
      code: "function topKFrequentElements(nums, k) {\n  if (!Array.isArray(nums) || nums.length === 0 || k <= 0) return [];\n  const freq = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    freq.set(nums[i], (freq.get(nums[i]) || 0) + 1);\n  }\n  const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);\n  const result = sorted.slice(0, k).map(entry => entry[0]);\n  return result.sort((a, b) => a - b);\n}",
      timeComplexity: "O(n log n)",
      spaceComplexity: "O(n)",
    },
    oracle: (input) => {
      const { nums, k } = input;
      const count = {};
      for (const n of nums) count[n] = (count[n] || 0) + 1;
      const keys = Object.keys(count).map(Number);
      keys.sort((a, b) => count[b] - count[a]);
      return keys.slice(0, k).sort((a, b) => a - b);
    },
    baselineTestCases: [
      { input: { nums: [1, 1, 1, 2, 2, 3], k: 2 }, expectedOutput: [1, 2], isHidden: false },
      { input: { nums: [1], k: 1 }, expectedOutput: [1], isHidden: false },
      { input: { nums: [4, 1, -1, 2, -1, 2, 3], k: 2 }, expectedOutput: [-1, 2], isHidden: true },
      { input: { nums: [5, 5, 5, 2, 2, 8], k: 1 }, expectedOutput: [5], isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { nums: [1, 1, 1, 2, 2, 3], k: 2 }, isHidden: false },
      { input: { nums: [1], k: 1 }, isHidden: false },
      { input: { nums: [4, 1, -1, 2, -1, 2, 3], k: 2 }, isHidden: true },
      { input: { nums: [7, 7, 7, 7, 8, 8, 9], k: 1 }, isHidden: true },
    ],
  },

  // 13. Two Pointers - Trapping Rain Water (Hard)
  {
    id: "twopointers-trapping-water",
    topic: "Two Pointers",
    pattern: "Two Pointers",
    difficulty: "Hard",
    title: "Trapping Rain Water",
    functionName: "trapRainWater",
    parameterNames: ["height"],
    description:
      "Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.",
    constraints: [
      "n == height.length",
      "1 <= n <= 2 * 10^4",
      "0 <= height[i] <= 10^5",
    ],
    examples: [
      {
        input: "height = [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]",
        output: "6",
        explanation: "The elevation map traps 6 units of rain water.",
      },
      {
        input: "height = [4, 2, 0, 3, 2, 5]",
        output: "9",
        explanation: "The elevation map traps 9 units of rain water.",
      },
    ],
    boilerplates: {
      javascript: "function trapRainWater(height) {\n  // Write your code here\n}",
      python: "def trapRainWater(height):\n    pass",
      java: "class Solution {\n    public int trapRainWater(int[] height) {\n        // Write your code here\n        return 0;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int trapRainWater(vector<int>& height) {\n        // Write your code here\n        return 0;\n    }\n};",
    },
    referenceSolution: {
      code: "function trapRainWater(height) {\n  if (!Array.isArray(height) || height.length < 3) return 0;\n  let left = 0;\n  let right = height.length - 1;\n  let leftMax = 0;\n  let rightMax = 0;\n  let water = 0;\n  while (left < right) {\n    if (height[left] < height[right]) {\n      if (height[left] >= leftMax) {\n        leftMax = height[left];\n      } else {\n        water += leftMax - height[left];\n      }\n      left++;\n    } else {\n      if (height[right] >= rightMax) {\n        rightMax = height[right];\n      } else {\n        water += rightMax - height[right];\n      }\n      right--;\n    }\n  }\n  return water;\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
    oracle: (input) => {
      const { height } = input;
      if (!Array.isArray(height) || height.length < 3) return 0;
      const n = height.length;
      const leftMax = new Array(n).fill(0);
      const rightMax = new Array(n).fill(0);
      leftMax[0] = height[0];
      for (let i = 1; i < n; i++) leftMax[i] = Math.max(leftMax[i - 1], height[i]);
      rightMax[n - 1] = height[n - 1];
      for (let i = n - 2; i >= 0; i--) rightMax[i] = Math.max(rightMax[i + 1], height[i]);
      let ans = 0;
      for (let i = 0; i < n; i++) {
        ans += Math.max(0, Math.min(leftMax[i], rightMax[i]) - height[i]);
      }
      return ans;
    },
    baselineTestCases: [
      { input: { height: [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1] }, expectedOutput: 6, isHidden: false },
      { input: { height: [4, 2, 0, 3, 2, 5] }, expectedOutput: 9, isHidden: false },
      { input: { height: [1, 2, 3] }, expectedOutput: 0, isHidden: true },
      { input: { height: [3, 0, 2, 0, 4] }, expectedOutput: 7, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { height: [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1] }, isHidden: false },
      { input: { height: [4, 2, 0, 3, 2, 5] }, isHidden: false },
      { input: { height: [3, 0, 0, 2, 0, 4] }, isHidden: true },
      { input: { height: [2, 0, 2] }, isHidden: true },
    ],
  },

  // 14. Dynamic Programming - Edit Distance (Hard)
  {
    id: "dp-edit-distance",
    topic: "Dynamic Programming",
    pattern: "2D Dynamic Programming",
    difficulty: "Hard",
    title: "Edit Distance",
    functionName: "minDistance",
    parameterNames: ["word1", "word2"],
    description:
      "Given two strings word1 and word2, return the minimum number of operations required to convert word1 to word2.\n\nYou have the following three operations permitted on a word:\n- Insert a character\n- Delete a character\n- Replace a character",
    constraints: [
      "0 <= word1.length, word2.length <= 500",
      "word1 and word2 consist of lowercase English letters.",
    ],
    examples: [
      {
        input: "word1 = 'horse', word2 = 'ros'",
        output: "3",
        explanation: "horse -> rorse (replace 'h' with 'r') -> rose (remove 'r') -> ros (remove 'e')",
      },
      {
        input: "word1 = 'intention', word2 = 'execution'",
        output: "5",
        explanation: "intention -> inention -> enention -> exention -> exection -> execution",
      },
    ],
    boilerplates: {
      javascript: "function minDistance(word1, word2) {\n  // Write your code here\n}",
      python: "def minDistance(word1, word2):\n    pass",
      java: "class Solution {\n    public int minDistance(String word1, String word2) {\n        // Write your code here\n        return 0;\n    }\n}",
      cpp: "class Solution {\npublic:\n    int minDistance(string word1, string word2) {\n        // Write your code here\n        return 0;\n    }\n};",
    },
    referenceSolution: {
      code: "function minDistance(word1, word2) {\n  const m = (word1 || '').length;\n  const n = (word2 || '').length;\n  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));\n  for (let i = 0; i <= m; i++) dp[i][0] = i;\n  for (let j = 0; j <= n; j++) dp[0][j] = j;\n  for (let i = 1; i <= m; i++) {\n    for (let j = 1; j <= n; j++) {\n      if (word1[i - 1] === word2[j - 1]) {\n        dp[i][j] = dp[i - 1][j - 1];\n      } else {\n        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);\n      }\n    }\n  }\n  return dp[m][n];\n}",
      timeComplexity: "O(m * n)",
      spaceComplexity: "O(m * n)",
    },
    oracle: (input) => {
      const { word1, word2 } = input;
      const m = (word1 || "").length;
      const n = (word2 || "").length;
      const memo = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) memo[i][0] = i;
      for (let j = 0; j <= n; j++) memo[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (word1[i - 1] === word2[j - 1]) {
            memo[i][j] = memo[i - 1][j - 1];
          } else {
            memo[i][j] = 1 + Math.min(memo[i - 1][j], memo[i][j - 1], memo[i - 1][j - 1]);
          }
        }
      }
      return memo[m][n];
    },
    baselineTestCases: [
      { input: { word1: "horse", word2: "ros" }, expectedOutput: 3, isHidden: false },
      { input: { word1: "intention", word2: "execution" }, expectedOutput: 5, isHidden: false },
      { input: { word1: "", word2: "" }, expectedOutput: 0, isHidden: true },
      { input: { word1: "a", word2: "b" }, expectedOutput: 1, isHidden: true },
    ],
    generateTestCases: (count = 4) => [
      { input: { word1: "horse", word2: "ros" }, isHidden: false },
      { input: { word1: "intention", word2: "execution" }, isHidden: false },
      { input: { word1: "", word2: "abc" }, isHidden: true },
      { input: { word1: "zoologico", word2: "zoologo" }, isHidden: true },
    ],
  },
];

/**
 * Returns all registered blueprints.
 */
export function getAllBlueprints() {
  return DSA_BLUEPRINTS;
}

/**
 * Finds a blueprint by its stable ID.
 */
export function getBlueprintById(id) {
  return DSA_BLUEPRINTS.find((b) => b.id === id) || null;
}

/**
 * Finds blueprints matching topic and optionally difficulty.
 * Normalizes topic names (plurals, case, aliases).
 */
export function findBlueprintsByTopicAndDifficulty(topic, difficulty) {
  const normTopic = String(topic || "").toLowerCase().trim();
  const normDiff = difficulty ? String(difficulty).toLowerCase().trim() : null;

  return DSA_BLUEPRINTS.filter((b) => {
    if (normTopic && normTopic !== "any" && normTopic !== "mixed") {
      const bTopic = b.topic.toLowerCase();
      const match =
        bTopic === normTopic ||
        bTopic.includes(normTopic) ||
        normTopic.includes(bTopic) ||
        (normTopic.includes("array") && bTopic === "arrays") ||
        (normTopic.includes("tree") && bTopic === "trees") ||
        (normTopic.includes("graph") && bTopic === "graphs") ||
        (normTopic.includes("string") && bTopic === "strings") ||
        (normTopic.includes("dp") && bTopic.includes("dynamic")) ||
        (normTopic.includes("hash") && bTopic === "hash map") ||
        (normTopic.includes("pointer") && bTopic === "two pointers") ||
        (normTopic.includes("interval") && bTopic === "intervals") ||
        (normTopic.includes("binary") && bTopic === "binary search") ||
        (normTopic.includes("stack") && bTopic === "stack");
      if (!match) return false;
    }

    if (normDiff) {
      if (b.difficulty.toLowerCase() !== normDiff) return false;
    }

    return true;
  });
}

/**
 * Returns all unique topic categories supported by the verified blueprint library.
 */
export function getAvailableTopics() {
  return Array.from(new Set(DSA_BLUEPRINTS.map((b) => b.topic)));
}

/**
 * Checks whether a requested topic is supported by the blueprint library.
 */
export function isTopicSupported(topic) {
  if (!topic) return true;
  const norm = String(topic).toLowerCase().trim();
  if (["any", "mixed", "dsa", "coding", "algo", "algorithm", "algorithms", "practice"].includes(norm)) return true;
  return findBlueprintsByTopicAndDifficulty(topic, null).length > 0;
}

/**
 * Selects the next blueprint for a problem request, maintaining variety across topics
 * and algorithmic patterns while avoiding recent problem titles or blueprint IDs.
 */
export function selectNextBlueprint({
  requestedTopic = null,
  requestedDifficulty = null,
  excludeTitles = [],
  recentBlueprintIds = [],
  recentTopics = [],
}) {
  const normTopic = requestedTopic ? String(requestedTopic).trim().toLowerCase() : "";
  const isGeneric = !normTopic || ["any", "mixed", "dsa", "coding", "algo", "algorithm", "algorithms", "practice"].includes(normTopic);
  const excludeTitleSet = new Set(
    (Array.isArray(excludeTitles) ? excludeTitles : [excludeTitles])
      .filter(Boolean)
      .map((t) => String(t).toLowerCase().trim())
  );
  const recentBpSet = new Set(recentBlueprintIds || []);
  const recentTopicSet = new Set(recentTopics || []);

  let eligible = [];

  if (!isGeneric) {
    // Topic is specifically requested (e.g. "Graphs", "Trees")
    eligible = findBlueprintsByTopicAndDifficulty(requestedTopic, requestedDifficulty);
    if (eligible.length === 0) {
      // Relax difficulty if none found for that specific difficulty
      eligible = findBlueprintsByTopicAndDifficulty(requestedTopic, null);
    }
  } else {
    // Generic rotation: find blueprints across rotation order
    // Prioritize topics not recently seen
    const unusedTopics = TOPIC_ROTATION_ORDER.filter(
      (t) => !recentTopicSet.has(t.toLowerCase())
    );

    const targetTopicList = unusedTopics.length > 0 ? unusedTopics : TOPIC_ROTATION_ORDER;

    // Collect all blueprints matching difficulty first
    if (requestedDifficulty) {
      eligible = DSA_BLUEPRINTS.filter(
        (b) => b.difficulty.toLowerCase() === requestedDifficulty.toLowerCase()
      );
    }
    if (eligible.length === 0) {
      eligible = [...DSA_BLUEPRINTS];
    }

    // Sort to prefer unused topics
    eligible.sort((a, b) => {
      const aUnused = targetTopicList.includes(a.topic) ? 1 : 0;
      const bUnused = targetTopicList.includes(b.topic) ? 1 : 0;
      return bUnused - aUnused;
    });
  }

  // Filter out recent blueprint IDs and excluded titles
  let unvisited = eligible.filter(
    (b) => !recentBpSet.has(b.id) && !excludeTitleSet.has(b.title.toLowerCase())
  );

  if (unvisited.length === 0) {
    // If all were recently visited, relax recentBlueprintIds constraint but preserve excludeTitle
    unvisited = eligible.filter((b) => !excludeTitleSet.has(b.title.toLowerCase()));
  }

  if (unvisited.length === 0) {
    // Fall back to any eligible matching the topic constraint
    unvisited = eligible.length > 0 ? eligible : (isGeneric ? DSA_BLUEPRINTS : []);
  }

  // Pick deterministic/stable best choice
  return unvisited[0] || (isGeneric ? DSA_BLUEPRINTS[0] : null);
}

/**
 * Builds a canonical, verified problem object from a blueprint.
 * Computes test cases with the trusted oracle.
 */
export function buildCanonicalProblemFromBlueprint(blueprint) {
  if (!blueprint) return null;

  // Generate test cases and compute verified expectedOutputs using the blueprint's oracle
  const testInputs = blueprint.generateTestCases
    ? blueprint.generateTestCases()
    : blueprint.baselineTestCases;

  const verifiedTestCases = testInputs.map((tc) => {
    const expected = blueprint.oracle(tc.input);
    return {
      input: tc.input,
      expectedOutput: expected,
      isHidden: Boolean(tc.isHidden),
    };
  });

  return {
    id: blueprint.id,
    blueprintId: blueprint.id,
    title: blueprint.title,
    description: blueprint.description,
    topic: blueprint.topic,
    difficulty: blueprint.difficulty,
    pattern: blueprint.pattern,
    constraints: [...blueprint.constraints],
    examples: [...blueprint.examples],
    boilerplates: { ...blueprint.boilerplates },
    referenceSolution: { ...blueprint.referenceSolution },
    testCases: verifiedTestCases,
    isVerifiedBlueprint: true,
  };
}
