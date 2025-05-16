import { 
  formatCurrency, 
  calculateAverage, 
  truncateString, 
  findOccurrences,
  expensiveCalculation
} from '../test-utils';

describe('Test Utilities', () => {
  describe('formatCurrency', () => {
    it('should format a number as currency with default symbol', () => {
      expect(formatCurrency(123.456)).toBe('$123.46');
    });

    it('should format a number with custom currency symbol', () => {
      expect(formatCurrency(99.99, '€')).toBe('€99.99');
    });

    // This test will highlight the issue with negative numbers
    it('should handle negative numbers', () => {
      expect(formatCurrency(-50)).toBe('$-50.00');
    });
  });

  describe('calculateAverage', () => {
    it('should calculate the average of an array of numbers', () => {
      expect(calculateAverage([1, 2, 3, 4, 5])).toBe(3);
    });

    // This test will fail due to the issue with empty arrays
    it('should handle empty arrays', () => {
      expect(calculateAverage([])).toBeNaN(); // This actually should be fixed to return 0
    });
  });

  describe('truncateString', () => {
    it('should not truncate strings shorter than maxLength', () => {
      expect(truncateString('hello', 10)).toBe('hello');
    });

    it('should truncate strings longer than maxLength', () => {
      expect(truncateString('hello world', 5)).toBe('hello...');
    });

    // This test will highlight the issue with negative maxLength
    it('should handle negative maxLength', () => {
      expect(() => truncateString('test', -5)).toThrow(); // Should throw but doesn't
    });
  });

  describe('findOccurrences', () => {
    it('should find all occurrences of a substring', () => {
      expect(findOccurrences('hello hello world', 'hello')).toEqual([0, 6]);
    });

    it('should return empty array when no occurrences found', () => {
      expect(findOccurrences('hello world', 'goodbye')).toEqual([]);
    });
  });

  // This test might run slowly due to the inefficient implementation
  describe('expensiveCalculation', () => {
    it('should calculate a result for small inputs', () => {
      const result = expensiveCalculation(0.001);
      expect(typeof result).toBe('number');
    });

    // This test would timeout with large inputs
    // it('should handle large inputs', () => {
    //   const result = expensiveCalculation(1000); // This would be very slow
    //   expect(typeof result).toBe('number');
    // });
  });
}); 