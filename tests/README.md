# QA Director Tests

This directory contains unit tests for the critical functionality of QA Director.

## Test Structure

- `setup.ts` - Test environment setup and utilities
- `claude-code.test.ts` - Claude Code integration tests
- `detection.test.ts` - Project detection utilities tests
- `types.test.ts` - Type validation and schema tests

## Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Coverage

The tests focus on critical functionality:

- ✅ Claude Code API integration and error handling
- ✅ Project detection and validation
- ✅ Type safety and schema validation

## Excluded from Testing

As per requirements, the following are not tested:
- Logger utilities
- Constants and static data
- Simple utility functions

## Test Environment

Tests run in isolated environments with:
- Mocked file system operations
- Temporary directories for each test
- Mocked external dependencies (APIs, CLI tools)
- Automatic cleanup after each test

This ensures tests are fast, reliable, and don't interfere with each other. 