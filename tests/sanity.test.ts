import { hello } from '../src/index';

describe('Sanity Check', () => {
  test('should return hello message', () => {
    expect(hello('World')).toBe('Hello, World!');
  });
});
