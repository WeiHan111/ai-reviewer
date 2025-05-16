/**
 * Test utilities for demonstrating PR review capabilities
 * These functions are deliberately written with a few minor issues
 * for the AI reviewer to catch and comment on.
 */

/**
 * Formats a number as currency with the specified currency symbol
 * @param amount The number to format
 * @param currency The currency symbol to use
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = '$'): string {
  // No validation for negative numbers
  const formatted = amount.toFixed(2);
  return `${currency}${formatted}`;
}

/**
 * Calculates the average of numbers in an array
 * @param numbers Array of numbers
 * @returns The average value
 */
export function calculateAverage(numbers: number[]): number {
  // This doesn't handle empty arrays properly
  const sum = numbers.reduce((acc, val) => acc + val, 0);
  return sum / numbers.length; // Will return NaN for empty array
}

/**
 * Truncates a string to the specified length and adds ellipsis if truncated
 * @param text String to truncate
 * @param maxLength Maximum length of the resulting string
 * @returns Truncated string
 */
export function truncateString(text: string, maxLength: number) {
  // Missing type for return value
  // Also no validation for maxLength being a positive number
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength) + '...';
}

/**
 * Finds all occurrences of a substring in a string
 * @param text The source string
 * @param search The substring to search for
 */
export function findOccurrences(text: string, search: string) {
  // Missing return type
  // Missing return value documentation
  const indices: number[] = [];
  let index = text.indexOf(search);
  
  while (index !== -1) {
    indices.push(index);
    index = text.indexOf(search, index + 1);
  }
  
  return indices;
}

// Deliberate memory leak with exponential time complexity
export const expensiveCalculation = (input: number): number => {
  let result = 0;
  for (let i = 0; i < input * 1000; i++) {
    result += Math.sin(i) * Math.cos(i);
  }
  return result;
};

// Unused parameter - should trigger a warning
export function processData(data: string, options: unknown): string {
  return data.toUpperCase();
}
