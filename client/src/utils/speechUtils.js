/**
 * Speech Recognition Transcript Accumulator
 *
 * Solves the pause-replacement bug where earlier words were dropped when SpeechRecognition
 * advanced event.resultIndex after a 2-3 second pause.
 *
 * Accumulates finalized segments throughout the recording session while cleanly updating
 * only the current interim segment. Preserves any pre-existing text typed before recording started.
 */
export class SpeechTranscriptAccumulator {
  constructor(initialText = '') {
    this.baseText = initialText ? initialText.trim() : '';
    this.sessionFinalText = '';
    this.sessionInterimText = '';
  }

  /**
   * Process a SpeechRecognitionEvent
   * @param {SpeechRecognitionEvent} event
   * @returns {string} Full accumulated transcript including base, finalized, and interim text
   */
  handleResult(event) {
    if (!event || !event.results) {
      return this.getFullTranscript();
    }

    const finalParts = [];
    const interimParts = [];

    // The Web Speech API maintains the cumulative results for the active session starting at index 0.
    // Looping from 0 ensures earlier finalized chunks are never discarded when resultIndex advances.
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const textPiece = result[0]?.transcript ? result[0].transcript.trim() : '';
      if (!textPiece) continue;

      if (result.isFinal) {
        finalParts.push(textPiece);
      } else {
        interimParts.push(textPiece);
      }
    }

    this.sessionFinalText = finalParts.join(' ');
    this.sessionInterimText = interimParts.join(' ');

    return this.getFullTranscript();
  }

  /**
   * Returns current full transcript (base + finalized + current interim)
   */
  getFullTranscript() {
    const parts = [
      this.baseText,
      this.sessionFinalText,
      this.sessionInterimText
    ].filter(Boolean);

    return parts.join(' ').trim();
  }

  /**
   * Returns only finalized text (base + finalized, omitting unfinished interim words)
   */
  getFinalizedTranscript() {
    const parts = [
      this.baseText,
      this.sessionFinalText
    ].filter(Boolean);

    return parts.join(' ').trim();
  }

  /**
   * Commits the current finalized text as the new base text (useful if recording session restarts)
   */
  commitSession() {
    this.baseText = this.getFinalizedTranscript();
    this.sessionFinalText = '';
    this.sessionInterimText = '';
    return this.baseText;
  }
}

/**
 * Filter, group, and sort speech synthesis voices.
 *
 * Rules:
 * - Excludes all Microsoft and Desktop voices.
 * - Deduplicates voices by voice name.
 * - Puts Google UK English (en-GB) voices at the very top.
 * - Shows remaining Google English voices next.
 * - Followed by other high-quality non-Microsoft English voices.
 * - Resolves the exact runtime name of the preferred voice.
 * - Preserves user selection when valid.
 *
 * @param {SpeechSynthesisVoice[]} allVoices
 * @param {string} savedVoiceName
 * @returns {{ sortedVoices: SpeechSynthesisVoice[], defaultVoiceName: string }}
 */
export const processSpeechVoices = (allVoices, savedVoiceName = '') => {
  if (!allVoices || allVoices.length === 0) {
    return { sortedVoices: [], defaultVoiceName: '' };
  }

  // Filter: English only, exclude all Microsoft / Desktop voices
  const nonMicrosoftEnglish = allVoices.filter((v) => {
    const lang = (v.lang || '').toLowerCase();
    const isEnglish = lang.startsWith('en');
    const isMicrosoft = /microsoft|desktop/i.test(v.name || '');
    return isEnglish && !isMicrosoft;
  });

  // Deduplicate by voice name
  const seen = new Set();
  const uniqueVoices = [];
  for (const voice of nonMicrosoftEnglish) {
    if (!seen.has(voice.name)) {
      seen.add(voice.name);
      uniqueVoices.push(voice);
    }
  }

  // 1. Google UK English (en-GB) voices
  const googleUkVoices = uniqueVoices.filter(
    (v) =>
      /google/i.test(v.name) &&
      (/en[-_]gb/i.test(v.lang) || /uk english/i.test(v.name))
  );

  // 2. Remaining Google English voices
  const otherGoogleEnglish = uniqueVoices.filter(
    (v) => /google/i.test(v.name) && !googleUkVoices.includes(v)
  );

  // 3. Remaining non-Microsoft English voices
  const remainingEnglish = uniqueVoices.filter(
    (v) => !/google/i.test(v.name)
  );

  const sortedVoices = [
    ...googleUkVoices,
    ...otherGoogleEnglish,
    ...remainingEnglish
  ];

  // Resolve best default voice name:
  let chosenVoiceName = '';
  if (savedVoiceName && sortedVoices.some((v) => v.name === savedVoiceName)) {
    chosenVoiceName = savedVoiceName;
  } else if (googleUkVoices.length > 0) {
    // Prefer Google UK English Male as default voice for new users/sessions
    const preferredUk =
      googleUkVoices.find((v) => /uk english male/i.test(v.name)) ||
      googleUkVoices.find((v) => /uk english female/i.test(v.name)) ||
      googleUkVoices[0];
    chosenVoiceName = preferredUk.name;
  } else if (otherGoogleEnglish.length > 0) {
    chosenVoiceName = otherGoogleEnglish[0].name;
  } else if (sortedVoices.length > 0) {
    chosenVoiceName = sortedVoices[0].name;
  }

  return { sortedVoices, defaultVoiceName: chosenVoiceName };
};
