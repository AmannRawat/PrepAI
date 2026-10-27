import posthog from 'posthog-js';

/**
 * PrepAI Privacy-Conscious Product Analytics Utility
 *
 * Implements strict schema validation, property allowlists, and value categorization.
 * Explicitly disables autocapture, session recording, form tracking, and console logging.
 * Never transmits sensitive code, resumes, transcripts, prompts, or personal identifying information.
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const POSTHOG_KEY = env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const ENVIRONMENT = env.MODE || 'development';
const APP_NAME = 'PrepAI';

let isInitialized = false;

// Strict event allowlist for product analytics
export const ALLOWED_EVENTS = Object.freeze({
  FEATURE_OPENED: 'feature_opened',
  DSA_PROBLEM_GENERATED: 'dsa_problem_generated',
  DSA_SUBMISSION_COMPLETED: 'dsa_submission_completed',
  BEHAVIORAL_INTERVIEW_STARTED: 'behavioral_interview_started',
  BEHAVIORAL_INTERVIEW_COMPLETED: 'behavioral_interview_completed',
  RESUME_REVIEW_STARTED: 'resume_review_started',
  RESUME_REVIEW_COMPLETED: 'resume_review_completed',
  STUDY_PLAN_CREATED: 'study_plan_created',
  SETTINGS_PREFERENCE_CHANGED: 'settings_preference_changed',
});

const ALLOWED_EVENT_NAMES = new Set(Object.values(ALLOWED_EVENTS));

// Standard allowed value categories to eliminate high-cardinality and arbitrary user strings
export const STANDARD_COMPANIES = new Set([
  'Google',
  'Meta',
  'Amazon',
  'Microsoft',
  'Apple',
  'Netflix',
  'Stripe',
  'Uber',
  'Tech Company',
]);

export const STANDARD_FEATURES = new Set([
  'dashboard',
  'dsa_arena',
  'behavioral_coach',
  'resume_reviewer',
  'progress_profile',
  'calendar',
  'settings',
]);

export const STANDARD_DSA_TOPICS = new Set([
  'Array',
  'String',
  'Linked List',
  'Tree',
  'Graph',
  'Dynamic Programming',
  'Two Pointers',
  'Binary Search',
  'Stack',
  'Queue',
  'Heap',
  'Recursion',
  'Sliding Window',
  'Greedy',
  'Backtracking',
  'Trie',
  'Bit Manipulation',
  'Sorting',
  'Matrix',
  'Design',
  'Math',
  'Hash Table',
]);

export const STANDARD_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
export const STANDARD_LANGUAGES = new Set(['javascript', 'python', 'java', 'cpp']);
export const STANDARD_VERDICTS = new Set([
  'Accepted',
  'Wrong Answer',
  'Time Limit Exceeded',
  'Runtime Error',
  'Compilation Error',
  'Memory Limit Exceeded',
  'Unknown',
]);

export const STANDARD_INTERVIEW_TYPES = new Set(['Behavioral', 'Technical', 'Mixed']);
export const STANDARD_EXPERIENCE_LEVELS = new Set([
  'intern',
  'fresher',
  'junior',
  'mid',
  'senior',
  'lead',
]);

export const STANDARD_ROLES = new Set([
  'Backend Developer',
  'Full-Stack Engineer',
  'Frontend Engineer',
  'DevOps / SRE Engineer',
  'Mobile Developer (iOS/Android)',
  'Data Engineer / AI Engineer',
  'Software Engineer',
  'general',
]);

export const BUILT_IN_WALLPAPERS = new Set([
  'bg-lake-morning',
  'bg-snow-peak',
  'bg-misty-forest',
  'bg-dreamy',
  'bg-moon-shine',
  'bg-aurora-night',
  'bg-dark-abstract',
  'bg-nebula',
  'custom',
]);

// Sensitive property keys that must NEVER be sent to analytics
// Matches standalone or word-delimited sensitive keys, without matching approved schema keys like 'feature_name' or 'company_name'
const FORBIDDEN_PROPERTY_REGEX = /(^|_)(code|solution|test_case|resume|transcript|answer|prompt|secret|token|password|email|phone|raw_body|error_stack)($|_)|^name$|^full_name$|^user_name$/i;

/**
 * Validate and sanitize properties according to strict event schemas.
 * Rejects arbitrary property names, and sanitizes string values into safe categories.
 */
export function validateEventProperties(eventName, properties = {}) {
  const sanitized = {};

  switch (eventName) {
    case ALLOWED_EVENTS.FEATURE_OPENED: {
      if (typeof properties.feature_name === 'string' && STANDARD_FEATURES.has(properties.feature_name)) {
        sanitized.feature_name = properties.feature_name;
      } else {
        return null; // Reject if invalid feature
      }
      break;
    }

    case ALLOWED_EVENTS.DSA_PROBLEM_GENERATED: {
      const topicStr = typeof properties.topic === 'string' ? properties.topic.trim() : '';
      sanitized.topic = STANDARD_DSA_TOPICS.has(topicStr) ? topicStr : 'other';

      const diffStr = typeof properties.difficulty === 'string' ? properties.difficulty.trim() : '';
      sanitized.difficulty = STANDARD_DIFFICULTIES.has(diffStr) ? diffStr : 'Medium';
      break;
    }

    case ALLOWED_EVENTS.DSA_SUBMISSION_COMPLETED: {
      const langStr = typeof properties.language === 'string' ? properties.language.toLowerCase().trim() : '';
      sanitized.language = STANDARD_LANGUAGES.has(langStr) ? langStr : 'javascript';

      const topicStr = typeof properties.topic === 'string' ? properties.topic.trim() : '';
      sanitized.topic = STANDARD_DSA_TOPICS.has(topicStr) ? topicStr : 'other';

      const diffStr = typeof properties.difficulty === 'string' ? properties.difficulty.trim() : '';
      sanitized.difficulty = STANDARD_DIFFICULTIES.has(diffStr) ? diffStr : 'Medium';

      const verdictStr = typeof properties.verdict === 'string' ? properties.verdict.trim() : '';
      sanitized.verdict = STANDARD_VERDICTS.has(verdictStr) ? verdictStr : 'Unknown';

      sanitized.passed_tests_count = typeof properties.passed_tests_count === 'number' && properties.passed_tests_count >= 0
        ? Math.floor(properties.passed_tests_count)
        : 0;
      sanitized.total_tests_count = typeof properties.total_tests_count === 'number' && properties.total_tests_count >= 0
        ? Math.floor(properties.total_tests_count)
        : 0;
      break;
    }

    case ALLOWED_EVENTS.BEHAVIORAL_INTERVIEW_STARTED: {
      const roleStr = typeof properties.role_category === 'string' ? properties.role_category.trim() : '';
      sanitized.role_category = STANDARD_ROLES.has(roleStr) ? roleStr : 'other';

      // Strictly map arbitrary company names to 'other' or standard allowlist
      const compStr = typeof properties.company_name === 'string' ? properties.company_name.trim() : '';
      sanitized.company_name = STANDARD_COMPANIES.has(compStr) ? compStr : 'other';

      const typeStr = typeof properties.interview_type === 'string' ? properties.interview_type.trim() : '';
      sanitized.interview_type = STANDARD_INTERVIEW_TYPES.has(typeStr) ? typeStr : 'Behavioral';

      const diffStr = typeof properties.difficulty === 'string' ? properties.difficulty.trim() : '';
      sanitized.difficulty = STANDARD_DIFFICULTIES.has(diffStr) ? diffStr : 'Medium';

      const expStr = typeof properties.experience_level === 'string' ? properties.experience_level.toLowerCase().trim() : '';
      sanitized.experience_level = STANDARD_EXPERIENCE_LEVELS.has(expStr) ? expStr : 'fresher';

      sanitized.uses_resume = Boolean(properties.uses_resume);
      break;
    }

    case ALLOWED_EVENTS.BEHAVIORAL_INTERVIEW_COMPLETED: {
      const roleStr = typeof properties.role_category === 'string' ? properties.role_category.trim() : '';
      sanitized.role_category = STANDARD_ROLES.has(roleStr) ? roleStr : 'other';

      const compStr = typeof properties.company_name === 'string' ? properties.company_name.trim() : '';
      sanitized.company_name = STANDARD_COMPANIES.has(compStr) ? compStr : 'other';

      const typeStr = typeof properties.interview_type === 'string' ? properties.interview_type.trim() : '';
      sanitized.interview_type = STANDARD_INTERVIEW_TYPES.has(typeStr) ? typeStr : 'Behavioral';

      const diffStr = typeof properties.final_difficulty === 'string' ? properties.final_difficulty.trim() : '';
      sanitized.final_difficulty = STANDARD_DIFFICULTIES.has(diffStr) ? diffStr : 'Medium';

      sanitized.turns_count = typeof properties.turns_count === 'number' && properties.turns_count >= 0
        ? Math.floor(properties.turns_count)
        : 1;
      break;
    }

    case ALLOWED_EVENTS.RESUME_REVIEW_STARTED: {
      sanitized.has_job_description = Boolean(properties.has_job_description);
      sanitized.file_format = properties.file_format === 'pdf' ? 'pdf' : 'unknown';
      break;
    }

    case ALLOWED_EVENTS.RESUME_REVIEW_COMPLETED: {
      const validBuckets = new Set(['80-100', '60-79', '0-59']);
      sanitized.score_bucket = validBuckets.has(properties.score_bucket) ? properties.score_bucket : '0-59';

      const validTiers = new Set(['strong', 'moderate', 'low']);
      sanitized.match_tier = validTiers.has(properties.match_tier) ? properties.match_tier : 'low';

      sanitized.has_job_description = Boolean(properties.has_job_description);
      sanitized.has_gaps = Boolean(properties.has_gaps);
      break;
    }

    case ALLOWED_EVENTS.STUDY_PLAN_CREATED: {
      sanitized.daily_target = typeof properties.daily_target === 'number' && properties.daily_target >= 1 && properties.daily_target <= 20
        ? Math.floor(properties.daily_target)
        : 1;
      sanitized.has_topics = Boolean(properties.has_topics);
      sanitized.plan_type = properties.plan_type === 'coach_personalized' || properties.plan_type === 'manual'
        ? properties.plan_type
        : 'coach_personalized';
      break;
    }

    case ALLOWED_EVENTS.SETTINGS_PREFERENCE_CHANGED: {
      const validSettingTypes = new Set(['theme', 'wallpaper']);
      if (!validSettingTypes.has(properties.setting_type)) {
        return null;
      }
      sanitized.setting_type = properties.setting_type;

      if (properties.setting_type === 'theme') {
        sanitized.new_value = properties.new_value === 'light' ? 'light' : 'dark';
      } else if (properties.setting_type === 'wallpaper') {
        // Strictly prevent user-uploaded filenames, paths, or arbitrary strings from being transmitted
        sanitized.new_value = BUILT_IN_WALLPAPERS.has(properties.new_value)
          ? properties.new_value
          : 'custom';
      }
      break;
    }

    default:
      return null;
  }

  // Double-check: scrub any forbidden key names if they somehow survived
  for (const key of Object.keys(sanitized)) {
    if (FORBIDDEN_PROPERTY_REGEX.test(key)) {
      delete sanitized[key];
    }
  }

  return sanitized;
}

/**
 * Initialize PostHog client centrally.
 * If credentials are not present, gracefully operates in no-op mode without throwing.
 */
export function initAnalytics() {
  if (isInitialized) {
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  if (!POSTHOG_KEY || typeof POSTHOG_KEY !== 'string' || POSTHOG_KEY.trim() === '') {
    if (Boolean(env.DEV)) {
      console.info('[PrepAI Analytics] VITE_POSTHOG_KEY not provided. Analytics operating in safe mock/no-op mode.');
    }
    return;
  }

  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      enable_recording_console_log: false,
      loaded: (ph) => {
        isInitialized = true;
        try {
          ph.register({
            app_name: APP_NAME,
            environment: ENVIRONMENT,
          });
        } catch {
          // ignore registration errors if mocked
        }
        if (Boolean(env.DEV)) {
          console.info('[PrepAI Analytics] PostHog initialized successfully with privacy safeguards enabled.');
        }
      },
    });
    isInitialized = true;
  } catch (err) {
    console.warn('[PrepAI Analytics] Failed to initialize PostHog:', err.message);
  }
}

/**
 * Track an explicitly allowlisted product event with validated safe schema metadata.
 *
 * @param {string} eventName - Must be one of ALLOWED_EVENTS
 * @param {Object} properties - Properties conforming to the event schema
 */
export function trackEvent(eventName, properties = {}) {
  if (!ALLOWED_EVENT_NAMES.has(eventName)) {
    if (Boolean(env.DEV)) {
      console.warn(`[PrepAI Analytics] Blocked non-allowlisted event: "${eventName}"`);
    }
    return;
  }

  const validatedProps = validateEventProperties(eventName, properties);
  if (!validatedProps) {
    if (Boolean(env.DEV)) {
      console.warn(`[PrepAI Analytics] Event "${eventName}" failed property schema validation; dropped.`);
    }
    return;
  }

  const enrichedPayload = {
    ...validatedProps,
    app_name: APP_NAME,
    environment: ENVIRONMENT,
  };

  try {
    if (isInitialized && typeof posthog.capture === 'function') {
      posthog.capture(eventName, enrichedPayload);
    } else if (Boolean(env.DEV)) {
      // In dev without PostHog configured, log safe event dispatch
      console.debug(`[PrepAI Analytics Event: ${eventName}]`, enrichedPayload);
    }
  } catch (err) {
    // Non-blocking: analytics failures must never break user interactions
    console.warn(`[PrepAI Analytics] Failed to capture event "${eventName}":`, err.message);
  }
}

/**
 * Associate subsequent actions with a stable internal account identifier upon authentication.
 * Never passes user names, emails, or personal details to PostHog.
 *
 * @param {string} userId - Stable internal Clerk user ID (e.g. user_2...)
 */
export function identifyUser(userId) {
  if (!userId || typeof userId !== 'string') {
    return;
  }

  try {
    if (isInitialized && typeof posthog.identify === 'function') {
      posthog.identify(userId, {
        app_name: APP_NAME,
        environment: ENVIRONMENT,
      });
    } else if (Boolean(env.DEV)) {
      console.debug('[PrepAI Analytics] Identified user with internal ID:', userId);
    }
  } catch (err) {
    console.warn('[PrepAI Analytics] Failed to identify user:', err.message);
  }
}

/**
 * Reset PostHog user identity on sign-out or account switching.
 * Regenerates an anonymous distinct ID to prevent cross-account attribution.
 */
export function resetUser() {
  try {
    if (isInitialized && typeof posthog.reset === 'function') {
      posthog.reset();
    } else if (Boolean(env.DEV)) {
      console.debug('[PrepAI Analytics] Reset analytics user identity.');
    }
  } catch (err) {
    console.warn('[PrepAI Analytics] Failed to reset user:', err.message);
  }
}

export default {
  initAnalytics,
  trackEvent,
  identifyUser,
  resetUser,
  ALLOWED_EVENTS,
  validateEventProperties,
};
