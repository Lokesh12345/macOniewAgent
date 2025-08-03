# Chrome Extension Tests

This folder contains all test files for the nanobrowser Chrome extension.

## Structure

```
tests/
├── browser/         # Browser-related tests (Puppeteer, DOM, etc.)
│   └── puppeteer-pool.test.ts
├── agent/           # Agent system tests (future)
├── integration/     # Integration tests (future)
└── unit/           # Unit tests (future)
```

## Running Tests

Currently, tests are organized for manual execution. To run a test:

```javascript
// Import and run from Chrome extension console
import { testPuppeteerPoolPerformance } from './tests/browser/puppeteer-pool.test';
await testPuppeteerPoolPerformance(tabId);
```

## Test Files

### browser/puppeteer-pool.test.ts
Tests the persistent Puppeteer connection pool to verify:
- Cold start performance (first connection)
- Warm start performance (reused connection)
- Connection validity and persistence

## Adding New Tests

1. Create test files with `.test.ts` or `.spec.ts` extension
2. Place in appropriate subfolder based on test type
3. Follow naming convention: `[feature-name].test.ts`
4. Import test utilities from source as needed

## Notes

- Tests are kept separate from source code for easy management
- Can be excluded from production builds
- Easy to delete or manage test files without affecting source code