import assert from 'node:assert/strict';
import {
  normalizeLanguage,
  formatCode,
  formatPython,
  formatCStyle,
} from '../src/utils/codeFormatter.js';

console.log('=================================================');
console.log('  MULTI-LANGUAGE CODE FORMATTER TEST SUITE');
console.log('=================================================\n');

let total = 0;
let passed = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(` [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(` [FAIL] ${name}`);
    console.error(err);
  }
}

// 1. Language Alias Normalization
test('normalizeLanguage correctly maps aliases for all 4 supported languages', () => {
  // JavaScript & TypeScript
  assert.equal(normalizeLanguage('javascript'), 'javascript');
  assert.equal(normalizeLanguage('JavaScript'), 'javascript');
  assert.equal(normalizeLanguage('js'), 'javascript');
  assert.equal(normalizeLanguage('ts'), 'javascript');
  assert.equal(normalizeLanguage('typescript'), 'javascript');
  assert.equal(normalizeLanguage('jsx'), 'javascript');
  assert.equal(normalizeLanguage('tsx'), 'javascript');

  // Python
  assert.equal(normalizeLanguage('python'), 'python');
  assert.equal(normalizeLanguage('Python'), 'python');
  assert.equal(normalizeLanguage('py'), 'python');
  assert.equal(normalizeLanguage('py3'), 'python');
  assert.equal(normalizeLanguage('python3'), 'python');

  // Java
  assert.equal(normalizeLanguage('java'), 'java');
  assert.equal(normalizeLanguage('Java'), 'java');
  assert.equal(normalizeLanguage(' JAVA '), 'java');

  // C++
  assert.equal(normalizeLanguage('cpp'), 'cpp');
  assert.equal(normalizeLanguage('c++'), 'cpp');
  assert.equal(normalizeLanguage('C++'), 'cpp');
  assert.equal(normalizeLanguage('cc'), 'cpp');
  assert.equal(normalizeLanguage('cxx'), 'cpp');
  assert.equal(normalizeLanguage('c'), 'cpp');

  // Unsupported languages
  assert.equal(normalizeLanguage('ruby'), null);
  assert.equal(normalizeLanguage('go'), null);
  assert.equal(normalizeLanguage('rust'), null);
  assert.equal(normalizeLanguage(''), null);
  assert.equal(normalizeLanguage(null), null);
});

// 2. JavaScript Formatting
test('formatCode transforms unformatted JavaScript into formatted output', async () => {
  const unformatted = 'function solve(nums){let sum=0;for(let i=0;i<nums.length;i++){sum+=nums[i]}return sum}';
  const result = await formatCode(unformatted, 'javascript');

  assert.equal(result.success, true);
  assert.ok(result.formatted.includes('function solve(nums) {'));
  assert.ok(result.formatted.includes('  return sum;'));
  assert.notEqual(result.formatted, unformatted);
});

test('formatCode works using JavaScript alias "js"', async () => {
  const unformatted = 'const greet=(name)=>{return "hello "+name;}';
  const result = await formatCode(unformatted, 'js');

  assert.equal(result.success, true);
  assert.ok(result.formatted.includes("return 'hello ' + name;"));
});

// 3. Python Formatting
test('formatCode transforms unformatted Python into PEP 8 compliant indentation', async () => {
  const unformatted = `def solve(nums):
total = 0
for x in nums:
if x > 0:
total += x
else:
total -= x
return total`;

  const result = await formatCode(unformatted, 'python');

  assert.equal(result.success, true);
  assert.ok(result.formatted.includes('def solve(nums):'));
  assert.ok(result.formatted.includes('    total = 0'));
  assert.ok(result.formatted.includes('    for x in nums:'));
  assert.ok(result.formatted.includes('        if x > 0:'));
  assert.ok(result.formatted.includes('            total += x'));
  assert.ok(result.formatted.includes('        else:'));
  assert.ok(result.formatted.includes('            total -= x'));
  assert.notEqual(result.formatted, unformatted);
});

test('formatCode works using Python alias "py"', async () => {
  const unformatted = 'class Solution:\ndef solve(self):\npass';
  const result = await formatCode(unformatted, 'py');

  assert.equal(result.success, true);
  assert.ok(result.formatted.includes('class Solution:'));
  assert.ok(result.formatted.includes('    def solve(self):'));
  assert.ok(result.formatted.includes('        pass'));
});

// 4. Java Formatting
test('formatCode transforms unformatted Java into standard 4-space braced output', async () => {
  const unformatted = `class Solution{
public void solve(){
int a=1;
int b=2;
if(a<b){
System.out.println(a);
}else{
System.out.println(b);
}
}
}`;

  const result = await formatCode(unformatted, 'java');

  assert.equal(result.success, true);
  assert.ok(result.formatted.includes('class Solution {'));
  assert.ok(result.formatted.includes('    public void solve() {'));
  assert.ok(result.formatted.includes('        int a = 1;'));
  assert.ok(result.formatted.includes('        if (a < b) {'));
  assert.ok(result.formatted.includes('            System.out.println(a);'));
  assert.ok(result.formatted.includes('        } else {'));
  assert.ok(result.formatted.includes('        }'));
  assert.ok(result.formatted.includes('}'));
  assert.notEqual(result.formatted, unformatted);
});

// 5. C++ Formatting
test('formatCode transforms unformatted C++ into standard formatted output with access specifiers', async () => {
  const unformatted = `#include <iostream>
#include <vector>
using namespace std;
class Solution{
public:
void solve(){
int x=10;
if(x>5){
cout<<x<<endl;
}
}
};`;

  const result = await formatCode(unformatted, 'cpp');

  assert.equal(result.success, true);
  assert.ok(result.formatted.includes('#include <iostream>'));
  assert.ok(result.formatted.includes('class Solution {'));
  assert.ok(result.formatted.includes('public:'));
  assert.ok(result.formatted.includes('    void solve() {'));
  assert.ok(result.formatted.includes('        int x = 10;'));
  assert.ok(result.formatted.includes('        if (x > 5) {'));
  assert.ok(result.formatted.includes('    }'));
  assert.ok(result.formatted.includes('};'));
  assert.notEqual(result.formatted, unformatted);
});

test('formatCode works using C++ alias "c++"', async () => {
  const unformatted = 'void foo(){int y=5;}';
  const result = await formatCode(unformatted, 'c++');

  assert.equal(result.success, true);
  assert.ok(result.formatted.includes('void foo() {'));
  assert.ok(result.formatted.includes('    int y = 5;'));
  assert.ok(result.formatted.includes('}'));
});

// 6. Unsupported Language & Error Handling
test('formatCode returns informative error for unsupported language without crashing', async () => {
  const result = await formatCode('puts "hello"', 'ruby');

  assert.equal(result.success, false);
  assert.ok(result.error.includes('Formatting for "ruby" is not yet supported'));
});

// Run all tests and summarize
setTimeout(() => {
  console.log('\n=================================================');
  console.log(`  FORMATTER TEST RESULTS: ${passed} / ${total} PASSED`);
  console.log('=================================================\n');
  if (passed !== total) {
    process.exit(1);
  }
}, 500);
