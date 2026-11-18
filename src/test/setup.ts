import "@testing-library/jest-dom/vitest";

beforeEach(() => {
  // Tests that run in the node environment have no localStorage.
  globalThis.localStorage?.clear();
  vi.restoreAllMocks();
});

