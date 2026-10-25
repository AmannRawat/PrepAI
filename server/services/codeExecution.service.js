const API_URL =
    process.env.ONLINECOMPILER_API_URL ||
    "https://api.onlinecompiler.io";

const COMPILER_IDS = {
    javascript: "nodejs-24",
    python: "python-3.14",
    java: "openjdk-25",
    cpp: "g++-15",
};

/**
 * Recursively normalizes values (sorting object keys) for deterministic comparison.
 */
function normalizeValue(value) {
    if (Array.isArray(value)) {
        return value.map(normalizeValue);
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, normalizeValue(value[key])])
        );
    }

    return value;
}

/**
 * Compares actual and expected outputs, ignoring object key ordering.
 */
export function valuesEqual(actual, expected) {
    if (
        JSON.stringify(normalizeValue(actual)) ===
        JSON.stringify(normalizeValue(expected))
    ) {
        return true;
    }

    // Coerce numeric / boolean / JSON string representation in expectedOutput
    if (typeof expected === "string" && actual !== null && actual !== undefined) {
        const trimmed = expected.trim();
        if (typeof actual === "number" && trimmed !== "" && !isNaN(Number(trimmed)) && Number(trimmed) === actual) {
            return true;
        }
        if (typeof actual === "boolean" && (trimmed === "true" || trimmed === "false") && (trimmed === "true") === actual) {
            return true;
        }
        if (typeof actual === "object") {
            try {
                const parsedExpected = JSON.parse(trimmed);
                if (
                    JSON.stringify(normalizeValue(actual)) ===
                    JSON.stringify(normalizeValue(parsedExpected))
                ) {
                    return true;
                }
            } catch {
                // Not valid JSON
            }
        }
    }

    // Coerce numeric / boolean / JSON string representation in actual
    if (typeof actual === "string" && expected !== null && expected !== undefined) {
        const trimmed = actual.trim();
        if (typeof expected === "number" && trimmed !== "" && !isNaN(Number(trimmed)) && Number(trimmed) === expected) {
            return true;
        }
        if (typeof expected === "boolean" && (trimmed === "true" || trimmed === "false") && (trimmed === "true") === expected) {
            return true;
        }
        if (typeof expected === "object") {
            try {
                const parsedActual = JSON.parse(trimmed);
                if (
                    JSON.stringify(normalizeValue(parsedActual)) ===
                    JSON.stringify(normalizeValue(expected))
                ) {
                    return true;
                }
            } catch {
                // Not valid JSON
            }
        }
    }

    return false;
}

/**
 * Builds the JavaScript harness for function-based DSA problem execution.
 */
function buildJavaScriptHarness(code, testCases) {
    const allMatches = [...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)];

    if (!allMatches.length) {
        throw new Error(
            "Could not find a JavaScript function declaration. Use the provided function boilerplate."
        );
    }

    // If multiple functions are present, identify the one matching test case parameter names
    let bestMatch = allMatches[0];
    if (allMatches.length > 1 && testCases.length > 0 && testCases[0].input && typeof testCases[0].input === "object") {
        const inputKeys = Object.keys(testCases[0].input);
        const matchWithParams = allMatches.find((m) => {
            const params = m[2].split(",").map((p) => p.trim()).filter(Boolean);
            return params.length === inputKeys.length && params.every((p) => inputKeys.includes(p));
        });
        if (matchWithParams) {
            bestMatch = matchWithParams;
        } else {
            const matchByCount = allMatches.find((m) => {
                const params = m[2].split(",").map((p) => p.trim()).filter(Boolean);
                return params.length === inputKeys.length;
            });
            if (matchByCount) {
                bestMatch = matchByCount;
            }
        }
    }

    const functionName = bestMatch[1];
    const parameters = bestMatch[2]
        .split(",")
        .map((parameter) => parameter.trim())
        .filter(Boolean);

    if (
        parameters.some(
            (parameter) => !/^[A-Za-z_$][\w$]*$/.test(parameter)
        )
    ) {
        throw new Error("Unsupported function parameter syntax.");
    }

    const serializedTests = JSON.stringify(
        testCases.map((testCase) => ({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            isHidden: testCase.isHidden,
        }))
    );

    return `
${code}

(async () => {
  const __solution = ${functionName};
  const __tests = ${serializedTests};
  const __paramNames = ${JSON.stringify(parameters)};
  const __results = [];

  for (let i = 0; i < __tests.length; i++) {
    const test = __tests[i];

    try {
      const inputObj = test.input || {};
      const inputKeys = Object.keys(inputObj);

      const args = __paramNames.map((param, idx) => {
        let val;
        if (Object.prototype.hasOwnProperty.call(inputObj, param)) {
          val = inputObj[param];
        } else if (idx < inputKeys.length) {
          val = inputObj[inputKeys[idx]];
        }
        return typeof structuredClone === "function" ? structuredClone(val) : JSON.parse(JSON.stringify(val));
      });

      const actual = await __solution(...args);

      __results.push({
        index: i,
        actual,
        expected: test.expectedOutput,
        runtimeError: null,
      });
    } catch (error) {
      __results.push({
        index: i,
        actual: null,
        expected: test.expectedOutput,
        runtimeError: String(error?.stack || error?.message || error),
      });
    }
  }

  console.log(
    "__PREPAI_START__" +
    JSON.stringify(__results) +
    "__PREPAI_END__"
  );
})();
`;
}

/**
 * Builds the Python harness for function-based DSA problem execution.
 */
function buildPythonHarness(code, testCases) {
    const match = code.match(
        /\bdef\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?\s*:/
    );

    if (!match) {
        throw new Error(
            "Could not find a Python function definition. Use the provided function boilerplate."
        );
    }

    const functionName = match[1];
    const rawParams = match[2]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

    const parameters = rawParams
        .map((p) => p.split("=")[0].split(":")[0].trim())
        .filter((p) => p && p !== "self");

    const serializedTests = JSON.stringify(
        testCases.map((testCase) => ({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            isHidden: testCase.isHidden,
        }))
    );

    return `
import copy
import json
import sys

${code}

def __prepai_runner():
    __solution = globals().get(${JSON.stringify(functionName)})
    if not callable(__solution):
        raise Exception(f"Function '${functionName}' is not defined or callable.")

    __tests = json.loads(${JSON.stringify(serializedTests)})
    __param_names = ${JSON.stringify(parameters)}
    __results = []

    for i, test in enumerate(__tests):
        try:
            inp = test.get("input", {})
            if isinstance(inp, list):
                args = [copy.deepcopy(inp[idx]) if idx < len(inp) else None for idx in range(len(__param_names))]
            else:
                inp_keys = list(inp.keys()) if isinstance(inp, dict) else []
                args = []
                for idx, p in enumerate(__param_names):
                    if isinstance(inp, dict) and p in inp:
                        val = inp[p]
                    elif idx < len(inp_keys):
                        val = inp[inp_keys[idx]]
                    else:
                        val = None
                    args.append(copy.deepcopy(val))

            actual = __solution(*args)
            __results.append({
                "index": i,
                "actual": actual,
                "expected": test.get("expectedOutput"),
                "runtimeError": None
            })
        except Exception as e:
            __results.append({
                "index": i,
                "actual": None,
                "expected": test.get("expectedOutput"),
                "runtimeError": f"{type(e).__name__}: {str(e)}"
            })

    print("__PREPAI_START__" + json.dumps(__results) + "__PREPAI_END__")

if __name__ == "__main__":
    __prepai_runner()
`;
}

/**
 * Helper to convert JavaScript values to Java literal expressions.
 */
function toJavaLiteral(val, paramType = "") {
    const type = (paramType || "").trim();

    if (val === null || val === undefined) {
        return "null";
    }

    if (typeof val === "boolean") {
        return val ? "true" : "false";
    }

    if (typeof val === "number") {
        if (type.startsWith("long") || type.startsWith("Long")) {
            return `${Math.trunc(val)}L`;
        }
        if (type.startsWith("float") || type.startsWith("Float")) {
            return `${val}f`;
        }
        if (type.startsWith("double") || type.startsWith("Double")) {
            return `${val}d`;
        }
        return String(val);
    }

    if (typeof val === "string") {
        if (type.startsWith("char") || type.startsWith("Character")) {
            const charVal = val.length > 0 ? val.charAt(0) : " ";
            const escaped =
                charVal === "'" ? "\\'" : charVal === "\\" ? "\\\\" : charVal;
            return `'${escaped}'`;
        }
        return JSON.stringify(val);
    }

    if (Array.isArray(val)) {
        if (val.length > 0 && Array.isArray(val[0])) {
            if (type.includes("char[][]")) {
                return `new char[][]{${val.map((row) => "{" + row.map((c) => `'${c}'`).join(", ") + "}").join(", ")}}`;
            }
            if (type.includes("String[][]")) {
                return `new String[][]{${val.map((row) => "{" + row.map((s) => JSON.stringify(s)).join(", ") + "}").join(", ")}}`;
            }
            if (type.includes("List")) {
                return `java.util.Arrays.asList(${val.map((row) => "java.util.Arrays.asList(" + row.map((x) => toJavaLiteral(x)).join(", ") + ")").join(", ")})`;
            }
            return `new int[][]{${val.map((row) => "{" + row.join(", ") + "}").join(", ")}}`;
        }

        if (type.startsWith("List") || type.includes("List<")) {
            return `new java.util.ArrayList<>(java.util.Arrays.asList(${val.map((x) => toJavaLiteral(x)).join(", ")}))`;
        }
        if (type.includes("char[]")) {
            return `new char[]{${val.map((c) => `'${c}'`).join(", ")}}`;
        }
        if (type.includes("String[]")) {
            return `new String[]{${val.map((s) => JSON.stringify(s)).join(", ")}}`;
        }
        if (type.includes("long[]")) {
            return `new long[]{${val.map((n) => `${n}L`).join(", ")}}`;
        }
        if (type.includes("double[]")) {
            return `new double[]{${val.map((n) => `${n}d`).join(", ")}}`;
        }
        if (type.includes("boolean[]")) {
            return `new boolean[]{${val.map((b) => (b ? "true" : "false")).join(", ")}}`;
        }

        if (val.length > 0 && typeof val[0] === "string") {
            return `new String[]{${val.map((s) => JSON.stringify(s)).join(", ")}}`;
        }
        if (val.length > 0 && typeof val[0] === "boolean") {
            return `new boolean[]{${val.map((b) => (b ? "true" : "false")).join(", ")}}`;
        }

        return `new int[]{${val.map((n) => Math.trunc(Number(n)) || 0).join(", ")}}`;
    }

    return JSON.stringify(val);
}

/**
 * Builds the Java harness for class Solution-based DSA execution.
 */
function buildJavaHarness(code, testCases) {
    const cleanedCode = code.replace(/^\s*package\s+[^;]+;\s*/gm, "");

    const publicMethodRegex =
        /public\s+(?:static\s+)?([A-Za-z0-9_<>[\]\s]+?)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
    const matches = [...cleanedCode.matchAll(publicMethodRegex)];

    if (matches.length === 0) {
        throw new Error(
            "Could not find a public Java method in class Solution. Use the provided method boilerplate."
        );
    }

    const expectedKeyCount =
        testCases?.[0]?.input && typeof testCases[0].input === "object"
            ? Object.keys(testCases[0].input).length
            : 0;

    let selectedMatch = matches[0];
    if (matches.length > 1) {
        for (const m of matches) {
            const raw = m[3]
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
            if (raw.length === expectedKeyCount) {
                selectedMatch = m;
                break;
            }
        }
    }

    const returnType = selectedMatch[1].trim();
    const methodName = selectedMatch[2].trim();
    const rawParams = selectedMatch[3]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

    const parameters = rawParams.map((p) => {
        const parts = p.trim().split(/\s+/);
        const name = parts[parts.length - 1];
        const type = parts.slice(0, parts.length - 1).join(" ");
        return { type, name };
    });

    const isVoid = returnType === "void";

    const testCasesCode = testCases
        .map((testCase, idx) => {
            const inputObj = testCase.input || {};
            const inputKeys = Object.keys(inputObj);

            const argsCode = parameters.map((param, pIdx) => {
                let val;
                if (Object.prototype.hasOwnProperty.call(inputObj, param.name)) {
                    val = inputObj[param.name];
                } else if (pIdx < inputKeys.length) {
                    val = inputObj[inputKeys[pIdx]];
                } else {
                    val = null;
                }
                return toJavaLiteral(val, param.type);
            });

            const expectedJson = JSON.stringify(testCase.expectedOutput ?? null);

            if (isVoid) {
                return `
        // Test case ${idx}
        try {
            sol.${methodName}(${argsCode.join(", ")});
            __results.append("{\\"index\\":${idx},\\"actual\\":null,\\"expected\\":${expectedJson},\\"runtimeError\\":null}");
        } catch (Throwable __e) {
            __results.append("{\\"index\\":${idx},\\"actual\\":null,\\"expected\\":${expectedJson},\\"runtimeError\\":\\"" + escapeJsonString(String.valueOf(__e.getMessage() != null ? __e.getMessage() : __e.toString())) + "\\"}");
        }
        ${idx < testCases.length - 1 ? '__results.append(",");' : ""}`;
            }

            return `
        // Test case ${idx}
        try {
            Object __actual = sol.${methodName}(${argsCode.join(", ")});
            __results.append("{\\"index\\":${idx},\\"actual\\":" + toJson(__actual) + ",\\"expected\\":${expectedJson},\\"runtimeError\\":null}");
        } catch (Throwable __e) {
            __results.append("{\\"index\\":${idx},\\"actual\\":null,\\"expected\\":${expectedJson},\\"runtimeError\\":\\"" + escapeJsonString(String.valueOf(__e.getMessage() != null ? __e.getMessage() : __e.toString())) + "\\"}");
        }
        ${idx < testCases.length - 1 ? '__results.append(",");' : ""}`;
        })
        .join("\n");

    return `
import java.util.*;
import java.io.*;
import java.lang.reflect.*;

${cleanedCode}

public class code {
    public static void main(String[] args) {
        Solution sol = new Solution();
        StringBuilder __results = new StringBuilder("[");

${testCasesCode}

        __results.append("]");
        System.out.println("__PREPAI_START__" + __results.toString() + "__PREPAI_END__");
    }

    public static String toJson(Object obj) {
        if (obj == null) return "null";
        if (obj instanceof String) {
            return "\\"" + escapeJsonString((String) obj) + "\\"";
        }
        if (obj instanceof Character) {
            return "\\"" + escapeJsonString(obj.toString()) + "\\"";
        }
        if (obj instanceof Number || obj instanceof Boolean) {
            return obj.toString();
        }
        if (obj.getClass().isArray()) {
            int len = Array.getLength(obj);
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < len; i++) {
                if (i > 0) sb.append(",");
                sb.append(toJson(Array.get(obj, i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (obj instanceof Collection<?>) {
            Collection<?> col = (Collection<?>) obj;
            StringBuilder sb = new StringBuilder("[");
            int i = 0;
            for (Object item : col) {
                if (i > 0) sb.append(",");
                sb.append(toJson(item));
                i++;
            }
            sb.append("]");
            return sb.toString();
        }
        if (obj instanceof Map<?, ?>) {
            Map<?, ?> map = (Map<?, ?>) obj;
            StringBuilder sb = new StringBuilder("{");
            int i = 0;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (i > 0) sb.append(",");
                sb.append(toJson(String.valueOf(entry.getKey()))).append(":").append(toJson(entry.getValue()));
                i++;
            }
            sb.append("}");
            return sb.toString();
        }
        return "\\"" + escapeJsonString(obj.toString()) + "\\"";
    }

    public static String escapeJsonString(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"') sb.append("\\\\\\"");
            else if (c == '\\\\') sb.append("\\\\\\\\");
            else if (c == '\\b') sb.append("\\\\b");
            else if (c == '\\f') sb.append("\\\\f");
            else if (c == '\\n') sb.append("\\\\n");
            else if (c == '\\r') sb.append("\\\\r");
            else if (c == '\\t') sb.append("\\\\t");
            else sb.append(c);
        }
        return sb.toString();
    }
}
`;
}

/**
 * Normalizes C++ storage types for argument declarations.
 */
function cleanCppStorageType(type, sampleVal) {
    if (type) {
        const cleaned = type
            .replace(/\bconst\b/g, "")
            .replace(/[&*]/g, "")
            .trim();
        if (cleaned) return cleaned;
    }

    if (Array.isArray(sampleVal)) {
        if (sampleVal.length > 0 && Array.isArray(sampleVal[0])) {
            return "std::vector<std::vector<int>>";
        }
        if (sampleVal.length > 0 && typeof sampleVal[0] === "string") {
            return "std::vector<std::string>";
        }
        return "std::vector<int>";
    }

    if (typeof sampleVal === "string") return "std::string";
    if (typeof sampleVal === "boolean") return "bool";
    if (typeof sampleVal === "number") {
        return Number.isInteger(sampleVal) ? "int" : "double";
    }

    return "auto";
}

/**
 * Helper to convert JavaScript values to C++ literal expressions.
 */
function toCppLiteral(val, paramType = "") {
    if (val === null || val === undefined) {
        return "nullptr";
    }

    if (typeof val === "boolean") {
        return val ? "true" : "false";
    }

    if (typeof val === "number") {
        if (paramType && (paramType.includes("long") || paramType.includes("int64"))) {
            return `${Math.trunc(val)}LL`;
        }
        return String(val);
    }

    if (typeof val === "string") {
        if (paramType && (paramType === "char" || paramType.includes("char&"))) {
            const escaped = val.charAt(0) === "'" ? "\\'" : val.charAt(0);
            return `'${escaped || " "}'`;
        }
        return JSON.stringify(val);
    }

    if (Array.isArray(val)) {
        return "{" + val.map((item) => toCppLiteral(item)).join(", ") + "}";
    }

    if (typeof val === "object") {
        return (
            "{" +
            Object.entries(val)
                .map(([k, v]) => `{"${k}", ${toCppLiteral(v)}}`)
                .join(", ") +
            "}"
        );
    }

    return String(val);
}

/**
 * Builds the C++ harness for class Solution-based DSA execution.
 */
function buildCppHarness(code, testCases) {
    const solutionBlockMatch = code.match(/class\s+Solution\s*\{([\s\S]*)\};?/);
    const body = solutionBlockMatch ? solutionBlockMatch[1] : code;

    let publicSection = body;
    const publicSplit = body.split(/\bpublic\s*:/);
    if (publicSplit.length > 1) {
        publicSection = publicSplit[1].split(/\b(?:private|protected)\s*:/)[0];
    }

    const methodRegex =
        /([A-Za-z0-9_:<>, ]+?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:const\s*)?\{?/g;
    const matches = [...publicSection.matchAll(methodRegex)].filter((m) => {
        const name = m[2];
        return name !== "Solution" && !name.startsWith("~") && m[1].trim() !== "";
    });

    if (matches.length === 0) {
        throw new Error(
            "Could not find a C++ method declaration in class Solution. Use the provided method boilerplate."
        );
    }

    const expectedKeyCount =
        testCases?.[0]?.input && typeof testCases[0].input === "object"
            ? Object.keys(testCases[0].input).length
            : 0;

    let selectedMatch = matches[0];
    if (matches.length > 1) {
        for (const m of matches) {
            const raw = m[3]
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);
            if (raw.length === expectedKeyCount) {
                selectedMatch = m;
                break;
            }
        }
    }

    const returnType = selectedMatch[1].trim();
    const methodName = selectedMatch[2].trim();
    const rawParams = selectedMatch[3]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

    const parameters = rawParams.map((p) => {
        const withoutDefault = p.split("=")[0].trim();
        const matchParam = withoutDefault.match(/^([\s\S]+?)\s*([&*]*\s*[A-Za-z_]\w*)$/);
        if (matchParam) {
            let type = matchParam[1].trim();
            let name = matchParam[2].trim();
            if (name.startsWith("&") || name.startsWith("*")) {
                type += name.charAt(0);
                name = name.slice(1).trim();
            }
            return { type, name };
        }
        return { type: withoutDefault, name: withoutDefault };
    });

    const isVoid = returnType === "void";

    const testCasesCode = testCases
        .map((testCase, idx) => {
            const inputObj = testCase.input || {};
            const inputKeys = Object.keys(inputObj);

            const argDecls = parameters.map((param, pIdx) => {
                let val;
                if (Object.prototype.hasOwnProperty.call(inputObj, param.name)) {
                    val = inputObj[param.name];
                } else if (pIdx < inputKeys.length) {
                    val = inputObj[inputKeys[pIdx]];
                } else {
                    val = null;
                }
                const storageType = cleanCppStorageType(param.type, val);
                const lit = toCppLiteral(val, param.type);
                return `        ${storageType} arg_${idx}_${pIdx} = ${lit};`;
            });

            const callArgs = parameters
                .map((_, pIdx) => `arg_${idx}_${pIdx}`)
                .join(", ");
            const expectedJson = JSON.stringify(testCase.expectedOutput ?? null);

            if (isVoid) {
                return `
    // Test case ${idx}
    try {
${argDecls.join("\n")}
        sol.${methodName}(${callArgs});
        std::cout << "{\\"index\\":${idx},\\"actual\\":null,\\"expected\\":${expectedJson},\\"runtimeError\\":null}";
    } catch (const std::exception& e) {
        std::cout << "{\\"index\\":${idx},\\"actual\\":null,\\"expected\\":${expectedJson},\\"runtimeError\\":\\"" << prepai::escapeJson(e.what()) << "\\"}";
    } catch (...) {
        std::cout << "{\\"index\\":${idx},\\"actual\\":null,\\"expected\\":${expectedJson},\\"runtimeError\\":\\"Unknown C++ exception occurred\\"}";
    }
    ${idx < testCases.length - 1 ? 'std::cout << ",";' : ""}`;
            }

            return `
    // Test case ${idx}
    try {
${argDecls.join("\n")}
        auto actual = sol.${methodName}(${callArgs});
        std::cout << "{\\"index\\":${idx},\\"actual\\":" << prepai::toJson(actual)
                  << ",\\"expected\\":${expectedJson},\\"runtimeError\\":null}";
    } catch (const std::exception& e) {
        std::cout << "{\\"index\\":${idx},\\"actual\\":null,\\"expected\\":${expectedJson},\\"runtimeError\\":\\"" << prepai::escapeJson(e.what()) << "\\"}";
    } catch (...) {
        std::cout << "{\\"index\\":${idx},\\"actual\\":null,\\"expected\\":${expectedJson},\\"runtimeError\\":\\"Unknown C++ exception occurred\\"}";
    }
    ${idx < testCases.length - 1 ? 'std::cout << ",";' : ""}`;
        })
        .join("\n");

    return `
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <map>
#include <set>
#include <unordered_map>
#include <unordered_set>
#include <queue>
#include <stack>
#include <deque>
#include <cmath>
#include <numeric>
#include <climits>
#include <tuple>
#include <utility>
#include <memory>
#include <functional>

using namespace std;

${code}

namespace prepai {
    inline string escapeJson(const string& s) {
        ostringstream o;
        for (char c : s) {
            if (c == '"') o << "\\\\\\\"";
            else if (c == '\\\\') o << "\\\\\\\\";
            else if (c == '\\b') o << "\\\\b";
            else if (c == '\\f') o << "\\\\f";
            else if (c == '\\n') o << "\\\\n";
            else if (c == '\\r') o << "\\\\r";
            else if (c == '\\t') o << "\\\\t";
            else o << c;
        }
        return o.str();
    }

    inline string toJson(bool val) { return val ? "true" : "false"; }
    inline string toJson(int val) { return to_string(val); }
    inline string toJson(long val) { return to_string(val); }
    inline string toJson(long long val) { return to_string(val); }
    inline string toJson(unsigned int val) { return to_string(val); }
    inline string toJson(unsigned long long val) { return to_string(val); }
    inline string toJson(float val) { ostringstream ss; ss << val; return ss.str(); }
    inline string toJson(double val) { ostringstream ss; ss << val; return ss.str(); }
    inline string toJson(char val) { return string("\\"") + escapeJson(string(1, val)) + "\\""; }
    inline string toJson(const string& val) { return string("\\"") + escapeJson(val) + "\\""; }
    inline string toJson(const char* val) { return val ? (string("\\"") + escapeJson(string(val)) + "\\"") : "null"; }

    template <typename T>
    string toJson(const vector<T>& vec) {
        string out = "[";
        for (size_t i = 0; i < vec.size(); ++i) {
            if (i > 0) out += ",";
            out += toJson(vec[i]);
        }
        out += "]";
        return out;
    }

    template <typename K, typename V>
    string toJson(const pair<K, V>& p) {
        return "[" + toJson(p.first) + "," + toJson(p.second) + "]";
    }
}

int main() {
    Solution sol;
    std::cout << "__PREPAI_START__[";
${testCasesCode}
    std::cout << "]__PREPAI_END__" << std::endl;
    return 0;
}
`;
}

/**
 * Determines whether an error message corresponds to a compilation or syntax error.
 */
function isCompilationError(errorMsg) {
    if (!errorMsg || typeof errorMsg !== "string") return false;
    const lower = errorMsg.toLowerCase();
    return (
        lower.includes("syntaxerror") ||
        lower.includes("indentationerror") ||
        lower.includes("compilation failed") ||
        lower.includes("error: ") ||
        lower.includes("fatal error:") ||
        lower.includes("cannot find symbol") ||
        lower.includes("undefined reference")
    );
}

/**
 * Executes user code against a set of test cases using OnlineCompiler API.
 * Sanitizes output before returning to protect hidden test-case inputs and outputs.
 */
export async function executeCode({
    code,
    language,
    testCases = [],
    isRunCode = false,
}) {
    if (typeof code !== "string" || !code.trim()) {
        throw new Error("Code must be a non-empty string.");
    }

    if (code.length > 20000) {
        throw new Error("Submitted code is too large (maximum 20,000 characters).");
    }

    if (!Array.isArray(testCases) || testCases.length === 0) {
        throw new Error("At least one test case is required.");
    }

    if (testCases.length > 25) {
        throw new Error("A maximum of 25 test cases is allowed.");
    }

    const normalizedLang = (language || "").toLowerCase().trim();

    if (!COMPILER_IDS[normalizedLang]) {
        throw new Error(`Unsupported programming language: ${language}`);
    }

    let runnableCode;

    if (normalizedLang === "javascript") {
        runnableCode = buildJavaScriptHarness(code, testCases);
    } else if (normalizedLang === "python") {
        runnableCode = buildPythonHarness(code, testCases);
    } else if (normalizedLang === "java") {
        runnableCode = buildJavaHarness(code, testCases);
    } else if (normalizedLang === "cpp") {
        runnableCode = buildCppHarness(code, testCases);
    } else {
        throw new Error(
            `Unsupported programming language: ${language}`
        );
    }

    const apiKey = process.env.ONLINECOMPILER_API_KEY;

    if (!apiKey) {
        throw new Error("OnlineCompiler API key is not configured.");
    }

    let response;
    let result;

    try {
        response = await fetch(
            `${API_URL.replace(/\/+$/, "")}/api/run-code-sync/`,
            {
                method: "POST",
                headers: {
                    Authorization: apiKey,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    compiler: COMPILER_IDS[normalizedLang],
                    code: runnableCode,
                    input: "",
                    time_limit: 8,
                }),
                signal: AbortSignal.timeout(15000),
            }
        );
        result = await response.json();
    } catch (fetchErr) {
        if (fetchErr.name === "TimeoutError" || fetchErr.name === "AbortError") {
            return {
                verdict: "Provider Timeout",
                error: "Execution provider timed out. The compiler service did not respond within 15 seconds.",
                passed: 0,
                total: testCases.length,
                isProviderFailure: true,
                executionTime: null,
                testResults: testCases.map((tc, idx) => ({
                    index: idx,
                    passed: false,
                    isHidden: Boolean(tc.isHidden),
                    ...(tc.isHidden
                        ? {}
                        : {
                              input: tc.input,
                              expected: tc.expectedOutput,
                              actual: null,
                          }),
                    runtimeError: "Execution provider timed out.",
                })),
            };
        }

        const isNetworkErr =
            fetchErr.name === "TypeError" ||
            /ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(fetchErr.message || "");

        if (isNetworkErr) {
            return {
                verdict: "Execution Unavailable",
                error: `Code execution provider network connection failed: ${fetchErr.message}`,
                passed: 0,
                total: testCases.length,
                isProviderFailure: true,
                executionTime: null,
                testResults: testCases.map((tc, idx) => ({
                    index: idx,
                    passed: false,
                    isHidden: Boolean(tc.isHidden),
                    ...(tc.isHidden
                        ? {}
                        : {
                              input: tc.input,
                              expected: tc.expectedOutput,
                              actual: null,
                          }),
                    runtimeError: "Code execution provider network connection failed.",
                })),
            };
        }

        throw fetchErr;
    }

    if (!response.ok) {
        console.error("OnlineCompiler HTTP error status:", response.status);

        const isQuota = response.status === 429;
        const isServerUnavailable = response.status >= 500;
        const errorMsg = isQuota
            ? "Execution quota or rate limit reached. Please wait a moment and try again."
            : isServerUnavailable
            ? "Code execution provider service is temporarily unavailable."
            : "The code execution provider rejected the request.";

        return {
            verdict: "Execution Unavailable",
            error: errorMsg,
            passed: 0,
            total: testCases.length,
            isProviderFailure: true,
            executionTime: null,
            testResults: testCases.map((tc, idx) => ({
                index: idx,
                passed: false,
                isHidden: Boolean(tc.isHidden),
                ...(tc.isHidden
                    ? {}
                    : {
                          input: tc.input,
                          expected: tc.expectedOutput,
                          actual: null,
                      }),
                runtimeError: errorMsg,
            })),
        };
    }

    // Check for provider-level timeout status, GNU timeout exit code (124), or container kill (137)
    const isTimeoutResult =
        result.status === "timeout" ||
        result.exit_code === 124 ||
        result.exit_code === 137 ||
        (typeof result.error === "string" &&
            (result.error.toLowerCase().includes("time limit") ||
             result.error.toLowerCase().includes("timed out") ||
             result.error.toLowerCase().includes("timeout") ||
             result.error.toLowerCase().includes("killed")));

    if (isTimeoutResult) {
        return {
            verdict: "Time Limit Exceeded",
            error: "Execution timed out. The program exceeded the time limit.",
            passed: 0,
            total: testCases.length,
            executionTime: result.time ?? null,
            testResults: testCases.map((tc, idx) => ({
                index: idx,
                passed: false,
                isHidden: Boolean(tc.isHidden),
                ...(tc.isHidden
                    ? {}
                    : {
                          input: tc.input,
                          expected: tc.expectedOutput,
                          actual: null,
                      }),
                runtimeError: "Execution timed out (Time Limit Exceeded).",
            })),
        };
    }


    // Handle process-level execution failures (syntax errors, compilation errors, process crashes)
    if (
        result.status !== "success" ||
        result.exit_code !== 0 ||
        result.truncated
    ) {
        const errorMsg =
            result.error ||
            result.output?.trim() ||
            "The program failed to execute.";
        const compilationErr = isCompilationError(errorMsg);
        const verdict = compilationErr ? "Compilation Error" : "Runtime Error";

        return {
            verdict,
            error: errorMsg,
            passed: 0,
            total: testCases.length,
            executionTime: result.time ?? null,
            testResults: testCases.map((tc, idx) => ({
                index: idx,
                passed: false,
                isHidden: Boolean(tc.isHidden),
                ...(tc.isHidden
                    ? {}
                    : {
                          input: tc.input,
                          expected: tc.expectedOutput,
                          actual: null,
                      }),
                runtimeError: errorMsg,
            })),
        };
    }

    let rawResults;

    try {
        const output = result.output ?? "";
        const match = output.match(/__PREPAI_START__(.*?)__PREPAI_END__/s);

        if (!match) {
            throw new Error("Runner test result markers not found in output.");
        }

        rawResults = JSON.parse(match[1]);
    } catch {
        const errorMsg =
            result.error ||
            result.output?.trim() ||
            "The runner returned an invalid result format.";
        return {
            verdict: "Runtime Error",
            error: errorMsg,
            passed: 0,
            total: testCases.length,
            executionTime: result.time ?? null,
            testResults: testCases.map((tc, idx) => ({
                index: idx,
                passed: false,
                isHidden: Boolean(tc.isHidden),
                ...(tc.isHidden
                    ? {}
                    : {
                          input: tc.input,
                          expected: tc.expectedOutput,
                          actual: null,
                      }),
                runtimeError: errorMsg,
            })),
        };
    }

    if (!Array.isArray(rawResults) || rawResults.length !== testCases.length) {
        throw new Error("The execution runner returned an unexpected result count.");
    }

    let hasRuntimeError = false;

    // Process each test result.
    // STRICT PRIVACY: For hidden test cases, NEVER include input, expected, or actual in the returned results.
    const sanitizedTestResults = rawResults.map((item, index) => {
        const testCase = testCases[index];
        const isHidden = Boolean(testCase.isHidden);
        const isError = Boolean(item.runtimeError);

        if (isError) {
            hasRuntimeError = true;
        }

        const passed =
            !isError && valuesEqual(item.actual, testCase.expectedOutput);

        if (isHidden) {
            return {
                index,
                passed,
                isHidden: true,
                ...(isError
                    ? { runtimeError: "Runtime error occurred on hidden test case." }
                    : {}),
            };
        }

        return {
            index,
            passed,
            isHidden: false,
            input: testCase.input,
            expected: testCase.expectedOutput,
            actual: item.actual,
            runtimeError: item.runtimeError || null,
        };
    });

    const passedCount = sanitizedTestResults.filter((t) => t.passed).length;
    let verdict = "Accepted";

    if (passedCount !== testCases.length) {
        verdict = hasRuntimeError ? "Runtime Error" : "Wrong Answer";
    }

    return {
        verdict,
        passed: passedCount,
        total: testCases.length,
        testResults: sanitizedTestResults,
        executionTime: result.time ?? null,
    };
}