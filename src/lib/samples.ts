import type { Language } from '@/lib/executor/types';

export interface Sample {
  id: string;
  title: string;
  category: 'basics' | 'recursion' | 'sorting' | 'data-structures' | 'algorithms';
  description: string;
  code: string;
}

export const SAMPLES: Record<Language, Sample[]> = {
  javascript: [
    {
      id: 'js-fib',
      title: 'Fibonacci (recursive)',
      category: 'recursion',
      description: 'Watch the call stack grow and collapse',
      code: `function fib(n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

const result = fib(5);
console.log(result);
`,
    },
    {
      id: 'js-factorial',
      title: 'Factorial',
      category: 'recursion',
      description: 'Linear recursion with multiplication',
      code: `function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

const result = factorial(5);
console.log(result);
`,
    },
    {
      id: 'js-bubble',
      title: 'Bubble Sort',
      category: 'sorting',
      description: 'Watch the array swap on each pass',
      code: `const arr = [5, 2, 8, 1, 9, 3];

for (let i = 0; i < arr.length; i++) {
  for (let j = 0; j < arr.length - i - 1; j++) {
    if (arr[j] > arr[j + 1]) {
      const temp = arr[j];
      arr[j] = arr[j + 1];
      arr[j + 1] = temp;
    }
  }
}

console.log(arr);
`,
    },
    {
      id: 'js-two-pointer',
      title: 'Two-Pointer Sum',
      category: 'algorithms',
      description: 'Find a pair that sums to target in sorted array',
      code: `const arr = [1, 2, 4, 5, 7, 11];
const target = 9;

let left = 0;
let right = arr.length - 1;
let result = null;

while (left < right) {
  const sum = arr[left] + arr[right];
  if (sum === target) {
    result = [arr[left], arr[right]];
    break;
  } else if (sum < target) {
    left++;
  } else {
    right--;
  }
}

console.log(result);
`,
    },
    {
      id: 'js-linked-list',
      title: 'Linked List Reverse',
      category: 'data-structures',
      description: 'Reverse a singly-linked list iteratively',
      code: `function makeNode(value, next = null) {
  return { value, next };
}

// Build: 1 -> 2 -> 3 -> 4
const head = makeNode(1, makeNode(2, makeNode(3, makeNode(4))));

let prev = null;
let curr = head;
while (curr !== null) {
  const next = curr.next;
  curr.next = prev;
  prev = curr;
  curr = next;
}

const reversed = prev;
console.log(reversed);
`,
    },
    {
      id: 'js-closure',
      title: 'Closure Counter',
      category: 'basics',
      description: 'See how closure captures the outer scope',
      code: `function makeCounter() {
  let count = 0;
  return function () {
    count++;
    return count;
  };
}

const counter = makeCounter();
const a = counter();
const b = counter();
const c = counter();

console.log(a, b, c);
`,
    },
    {
      id: 'js-binary-search',
      title: 'Binary Search',
      category: 'algorithms',
      description: 'Classic O(log n) search',
      code: `const arr = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
const target = 13;

let lo = 0;
let hi = arr.length - 1;
let foundAt = -1;

while (lo <= hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (arr[mid] === target) {
    foundAt = mid;
    break;
  } else if (arr[mid] < target) {
    lo = mid + 1;
  } else {
    hi = mid - 1;
  }
}

console.log(foundAt);
`,
    },
    {
      id: 'js-hashmap',
      title: 'Object as HashMap',
      category: 'data-structures',
      description: 'Count word frequencies',
      code: `const words = ['apple', 'banana', 'apple', 'cherry', 'banana', 'apple'];
const counts = {};

for (const word of words) {
  if (counts[word] === undefined) {
    counts[word] = 1;
  } else {
    counts[word]++;
  }
}

console.log(counts);
`,
    },
  ],

  java: [
    {
      id: 'java-fib',
      title: 'Fibonacci (recursive)',
      category: 'recursion',
      description: 'Recursive call stack visualization',
      code: `public class Demo {
    static int fib(int n) {
        if (n < 2) return n;
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        int result = fib(5);
        System.out.println(result);
    }
}
`,
    },
    {
      id: 'java-bubble',
      title: 'Bubble Sort',
      category: 'sorting',
      description: 'Sort an int[] in place',
      code: `public class Demo {
    public static void main(String[] args) {
        int[] arr = {5, 2, 8, 1, 9, 3};

        for (int i = 0; i < arr.length; i++) {
            for (int j = 0; j < arr.length - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }

        System.out.println(java.util.Arrays.toString(arr));
    }
}
`,
    },
    {
      id: 'java-arraylist',
      title: 'ArrayList Operations',
      category: 'data-structures',
      description: 'Add, remove, iterate over an ArrayList',
      code: `int[] data = {3, 1, 4, 1, 5, 9, 2, 6};

ArrayList<Integer> list = new ArrayList<>();
for (int x : data) {
    list.add(x);
}

list.remove(Integer.valueOf(1)); // remove first 1

int sum = 0;
for (int x : list) {
    sum += x;
}

System.out.println("size = " + list.size() + ", sum = " + sum);
`,
    },
    {
      id: 'java-binary-search',
      title: 'Binary Search',
      category: 'algorithms',
      description: 'O(log n) search in a sorted array',
      code: `int[] arr = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
int target = 13;

int lo = 0;
int hi = arr.length - 1;
int foundAt = -1;

while (lo <= hi) {
    int mid = (lo + hi) / 2;
    if (arr[mid] == target) {
        foundAt = mid;
        break;
    } else if (arr[mid] < target) {
        lo = mid + 1;
    } else {
        hi = mid - 1;
    }
}

System.out.println(foundAt);
`,
    },
    {
      id: 'java-factorial',
      title: 'Factorial',
      category: 'recursion',
      description: 'Linear recursion',
      code: `public class Demo {
    static long factorial(int n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    }

    public static void main(String[] args) {
        long result = factorial(6);
        System.out.println(result);
    }
}
`,
    },
    {
      id: 'java-hashmap',
      title: 'HashMap Word Count',
      category: 'data-structures',
      description: 'Count occurrences of each word',
      code: `String[] words = {"apple", "banana", "apple", "cherry", "banana", "apple"};
HashMap<String, Integer> counts = new HashMap<>();

for (String word : words) {
    counts.put(word, counts.getOrDefault(word, 0) + 1);
}

System.out.println(counts);
`,
    },
  ],
};
