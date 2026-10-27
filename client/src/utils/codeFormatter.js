import prettier from 'prettier/standalone';
import babel from 'prettier/plugins/babel';
import estree from 'prettier/plugins/estree';

/**
 * Normalizes a language name or file extension into a canonical language ID:
 * 'javascript', 'python', 'java', 'cpp'
 *
 * Supports aliases such as:
 * - 'js', 'ts', 'typescript', 'jsx', 'tsx' -> 'javascript'
 * - 'py', 'py3', 'python3' -> 'python'
 * - 'java' -> 'java'
 * - 'c++', 'cc', 'cxx', 'c', 'h', 'hpp' -> 'cpp'
 */
export function normalizeLanguage(lang) {
  if (!lang || typeof lang !== 'string') return null;
  const l = lang.trim().toLowerCase();

  switch (l) {
    case 'javascript':
    case 'js':
    case 'typescript':
    case 'ts':
    case 'jsx':
    case 'tsx':
      return 'javascript';

    case 'python':
    case 'py':
    case 'py3':
    case 'python3':
      return 'python';

    case 'java':
      return 'java';

    case 'cpp':
    case 'c++':
    case 'cc':
    case 'cxx':
    case 'c':
    case 'h':
    case 'hpp':
      return 'cpp';

    default:
      return null;
  }
}

/**
 * Normalizes spacing around binary operators and commas within a code line,
 * while safely ignoring contents inside strings or comments.
 */
function normalizeLineSpacing(line, isPython = false) {
  if (!line || !line.trim()) return line;

  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let escaped = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1] || '';

    if (escaped) {
      result += char;
      escaped = false;
      i++;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
      i++;
      continue;
    }

    // Single-line comment detection
    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (isPython && char === '#') {
        const commentPart = line.slice(i).trim();
        if (result && !result.endsWith(' ')) {
          result += ' ';
        }
        result += commentPart;
        break;
      }

      if (!isPython && char === '/' && nextChar === '/') {
        const commentPart = line.slice(i).trim();
        if (result && !result.endsWith(' ')) {
          result += ' ';
        }
        result += commentPart;
        break;
      }
    }

    // Toggle quote states
    if (char === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      result += char;
      i++;
      continue;
    }

    if (char === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
      i++;
      continue;
    }

    if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      result += char;
      i++;
      continue;
    }

    // If inside a string literal, preserve verbatim
    if (inSingleQuote || inDoubleQuote || inBacktick) {
      result += char;
      i++;
      continue;
    }

    // Multi-char operators: ==, !=, <=, >=, +=, -=, *=, /=, %=, &&, ||, ->, <<, >>, ++, --
    const twoChars = char + nextChar;
    if (
      twoChars === '==' ||
      twoChars === '!=' ||
      twoChars === '<=' ||
      twoChars === '>=' ||
      twoChars === '+=' ||
      twoChars === '-=' ||
      twoChars === '*=' ||
      twoChars === '/=' ||
      twoChars === '%=' ||
      twoChars === '&&' ||
      twoChars === '||' ||
      twoChars === '->' ||
      twoChars === '<<' ||
      twoChars === '>>'
    ) {
      result = result.trimEnd() + ' ' + twoChars + ' ';
      i += 2;
      continue;
    }

    if (twoChars === '++' || twoChars === '--') {
      result = result.trimEnd() + twoChars;
      i += 2;
      continue;
    }

    // Single-char operators: =, +, -, *, /, %, <, >
    if (char === '=') {
      result = result.trimEnd() + ' = ';
      i++;
      continue;
    }

    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '%' || char === '<' || char === '>') {
      // Check if #include <...>
      if ((char === '<' || char === '>') && (line.includes('#include') || result.includes('#include'))) {
        result += char;
        i++;
        continue;
      }

      // Check template type e.g. vector<int> or Map<String, Integer>
      if (
        char === '<' &&
        /^[a-zA-Z0-9_,\s<>]+>/.test(line.slice(i + 1)) &&
        /(vector|list|map|set|pair|queue|stack|deque|priority_queue|unordered_map|unordered_set|unique_ptr|shared_ptr|List|Map|Set|ArrayList|HashMap|HashSet)$/.test(result.trimEnd())
      ) {
        result = result.trimEnd() + '<';
        i++;
        continue;
      }

      if (
        char === '>' &&
        /(int|string|double|char|bool|long|Integer|String|Double|Boolean|Float|>)$/.test(result.trimEnd())
      ) {
        result = result.trimEnd() + '>';
        i++;
        continue;
      }

      result = result.trimEnd() + ' ' + char + ' ';
      i++;
      continue;
    }

    // Comma
    if (char === ',') {
      result = result.trimEnd() + ', ';
      i++;
      continue;
    }

    // Semicolon
    if (char === ';') {
      result = result.trimEnd() + ';';
      if (nextChar && nextChar !== ' ' && nextChar !== '\n') {
        result += ' ';
      }
      i++;
      continue;
    }

    // Colon in control statements (Python or C++ case/labels)
    if (char === ':') {
      if (!isPython && twoChars === '::') {
        result = result.trimEnd() + '::';
        i += 2;
        continue;
      }
      result = result.trimEnd() + ':';
      if (nextChar && nextChar !== ' ' && nextChar !== '\n') {
        result += ' ';
      }
      i++;
      continue;
    }

    result += char;
    i++;
  }

  return result.replace(/ {2,}/g, ' ');
}

/**
 * Pre-processes C-style code (Java / C++) to ensure clean token boundaries:
 * - Inserts a space before opening brace '{'
 * - Splits statements enclosed immediately after '{' onto their own line
 * - Splits statements ending before '}' onto their own line
 * - Splits statements separated by ';' onto their own line (outside for-loops)
 */
function splitCStyleStatements(code) {
  let result = '';
  let inStr = false;
  let strChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';
    const next = i + 1 < code.length ? code[i + 1] : '';

    if (inLineComment) {
      result += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      result += ch;
      if (prev === '*' && ch === '/') {
        inBlockComment = false;
      }
      continue;
    }

    if (inStr) {
      result += ch;
      if (ch === strChar && prev !== '\\') {
        inStr = false;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      result += ch;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      result += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = true;
      strChar = ch;
      result += ch;
      continue;
    }

    // Space before '{'
    if (ch === '{') {
      if (result.length > 0 && !/\s/.test(result[result.length - 1])) {
        result += ' ';
      }
      result += '{';
      let j = i + 1;
      while (j < code.length && (code[j] === ' ' || code[j] === '\t')) j++;
      if (j < code.length && code[j] !== '\n' && code[j] !== '}') {
        result += '\n';
        i = j - 1;
      }
      continue;
    }

    // Newline before '}' if preceded by statement on same line
    if (ch === '}') {
      const lastLine = result.split('\n').pop();
      if (lastLine.trim().length > 0 && !lastLine.endsWith('{')) {
        result += '\n';
      }
      result += '}';
      continue;
    }

    // Newline after ';' if followed by statement on same line
    if (ch === ';') {
      result += ';';
      let j = i + 1;
      while (j < code.length && (code[j] === ' ' || code[j] === '\t')) j++;
      if (j < code.length && code[j] !== '\n' && code[j] !== '}' && code[j] !== '/') {
        const openParen = (result.match(/\(/g) || []).length;
        const closeParen = (result.match(/\)/g) || []).length;
        if (openParen <= closeParen) {
          result += '\n';
          i = j - 1;
        }
      }
      continue;
    }

    result += ch;
  }
  return result;
}

/**
 * Deterministic browser-side formatter for Python code according to PEP 8 conventions.
 */
export function formatPython(code, indentSize = 4) {
  if (typeof code !== 'string') return '';
  const lines = code.split('\n');
  const formattedLines = [];
  let indentLevel = 0;
  let inTripleQuote = false;
  let tripleQuoteChar = '';

  const indentUnit = ' '.repeat(indentSize);
  const dedentKeywords = /^\s*(elif\b|else\b|except\b|finally\b)/;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    const tripleDouble = (rawLine.match(/"""/g) || []).length;
    const tripleSingle = (rawLine.match(/'''/g) || []).length;

    if (inTripleQuote) {
      formattedLines.push(rawLine.trimEnd());
      if (
        (tripleQuoteChar === '"""' && tripleDouble % 2 === 1) ||
        (tripleQuoteChar === "'''" && tripleSingle % 2 === 1)
      ) {
        inTripleQuote = false;
        tripleQuoteChar = '';
      }
      continue;
    }

    if (tripleDouble % 2 === 1) {
      inTripleQuote = true;
      tripleQuoteChar = '"""';
    } else if (tripleSingle % 2 === 1) {
      inTripleQuote = true;
      tripleQuoteChar = "'''";
    }

    if (!trimmed) {
      if (
        formattedLines.length === 0 ||
        formattedLines[formattedLines.length - 1] === ''
      ) {
        continue;
      }
      formattedLines.push('');
      continue;
    }

    if (trimmed.startsWith('#')) {
      formattedLines.push(indentUnit.repeat(indentLevel) + trimmed);
      continue;
    }

    if (dedentKeywords.test(trimmed)) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const spaced = normalizeLineSpacing(trimmed, true);
    formattedLines.push(indentUnit.repeat(indentLevel) + spaced);

    const codeBeforeComment = spaced.split('#')[0].trim();
    if (codeBeforeComment.endsWith(':')) {
      indentLevel++;
    }
  }

  let result = formattedLines.join('\n').trimEnd();
  return result ? result + '\n' : '';
}

/**
 * Deterministic browser-side formatter for Java and C++ code.
 */
export function formatCStyle(code, language = 'java', indentSize = 4) {
  if (typeof code !== 'string') return '';
  const preprocessed = splitCStyleStatements(code);
  const lines = preprocessed.split('\n');
  const formattedLines = [];
  let indentLevel = 0;
  let inBlockComment = false;

  const indentUnit = ' '.repeat(indentSize);
  const isCpp = language === 'cpp';

  const cppAccessSpecifiers = /^\s*(public|private|protected)\s*:/;
  const cppPreprocessor = /^\s*#\s*(include|define|undef|ifdef|ifndef|if|else|elif|endif|pragma)\b/;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    if (inBlockComment) {
      formattedLines.push(indentUnit.repeat(indentLevel) + trimmed);
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true;
      formattedLines.push(indentUnit.repeat(indentLevel) + trimmed);
      continue;
    }

    if (!trimmed) {
      if (
        formattedLines.length === 0 ||
        formattedLines[formattedLines.length - 1] === ''
      ) {
        continue;
      }
      formattedLines.push('');
      continue;
    }

    if (isCpp && cppPreprocessor.test(trimmed)) {
      formattedLines.push(trimmed);
      continue;
    }

    let leadingCloses = 0;
    let netChange = 0;
    let inStr = false;
    let strChar = '';

    for (let c = 0; c < trimmed.length; c++) {
      const ch = trimmed[c];
      const prev = c > 0 ? trimmed[c - 1] : '';

      if (inStr) {
        if (ch === strChar && prev !== '\\') {
          inStr = false;
        }
        continue;
      }

      if ((ch === '"' || ch === "'") && prev !== '\\') {
        inStr = true;
        strChar = ch;
        continue;
      }

      if (ch === '/' && trimmed[c + 1] === '/') {
        break;
      }

      if (ch === '}') {
        netChange--;
        if (netChange < 0 && leadingCloses < Math.abs(netChange)) {
          leadingCloses++;
        }
      } else if (ch === '{') {
        netChange++;
      }
    }

    if (trimmed.startsWith('}') || leadingCloses > 0) {
      indentLevel = Math.max(0, indentLevel - leadingCloses);
    }

    const isAccessSpecifier = isCpp && cppAccessSpecifiers.test(trimmed);
    const effectiveIndent = isAccessSpecifier
      ? Math.max(0, indentLevel - 1)
      : indentLevel;

    let spaced = normalizeLineSpacing(trimmed, false);

    spaced = spaced
      .replace(/([^\s\(\{\[])\s*\{/g, '$1 {')
      .replace(/\}([a-zA-Z])/g, '} $1')
      .replace(/\b(if|for|while|switch|catch)\s*\(/g, '$1 (')
      .replace(/\)\s*\{/g, ') {')
      .replace(/else\s*\{/g, 'else {')
      .replace(/try\s*\{/g, 'try {')
      .replace(/finally\s*\{/g, 'finally {')
      .replace(/do\s*\{/g, 'do {');

    formattedLines.push(indentUnit.repeat(effectiveIndent) + spaced);

    const remainingOpeners = netChange + leadingCloses;
    if (remainingOpeners > 0) {
      indentLevel += remainingOpeners;
    }
  }

  let result = formattedLines.join('\n').trimEnd();
  return result ? result + '\n' : '';
}

/**
 * Unified multi-language formatter entry point.
 */
export async function formatCode(code, language, options = {}) {
  const normalized = normalizeLanguage(language);

  if (!normalized) {
    return {
      success: false,
      formatted: code,
      error: `Formatting for "${language || 'unknown'}" is not yet supported. Supported: JavaScript, Python, Java, C++.`,
    };
  }

  if (!code || typeof code !== 'string') {
    return {
      success: true,
      formatted: '',
    };
  }

  try {
    let formatted = code;

    switch (normalized) {
      case 'javascript': {
        formatted = await prettier.format(code, {
          parser: 'babel',
          plugins: [babel, estree],
          singleQuote: true,
          trailingComma: 'es5',
          tabWidth: options.tabWidth || 2,
          semi: true,
        });
        break;
      }

      case 'python': {
        formatted = formatPython(code, options.indentSize || 4);
        break;
      }

      case 'java': {
        formatted = formatCStyle(code, 'java', options.indentSize || 4);
        break;
      }

      case 'cpp': {
        formatted = formatCStyle(code, 'cpp', options.indentSize || 4);
        break;
      }

      default:
        return {
          success: false,
          formatted: code,
          error: `Unhandled language formatter for "${normalized}".`,
        };
    }

    return {
      success: true,
      formatted,
    };
  } catch (err) {
    console.error(`[Code Formatter] Failed to format ${normalized} code:`, err);
    return {
      success: false,
      formatted: code,
      error: err.message || `Failed to format ${normalized} code.`,
    };
  }
}
