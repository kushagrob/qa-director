# Contributing to QA Director

Thank you for your interest in contributing to QA Director! This guide will help you get started.

## Development Setup

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/your-username/qa-director.git
   cd qa-director
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Run the development version:**
   ```bash
   pnpm run dev
   ```

## Development Workflow

### Code Style

- We use Prettier for code formatting
- ESLint for code linting
- TypeScript for type safety

Run these commands before submitting:

```bash
pnpm run format
pnpm run lint
pnpm run typecheck
```

### Testing

- Add tests for new features
- Ensure all tests pass before submitting
- Run tests with: `pnpm test`

### Commit Messages

Use conventional commits format:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `test:` for adding tests
- `refactor:` for code refactoring

Example: `feat: add support for custom test selectors`

## Submitting Changes

1. **Create a feature branch:**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes and test thoroughly**

3. **Run the full test suite:**

   ```bash
   pnpm run build
   pnpm run lint
   pnpm run typecheck
   pnpm run test
   ```

4. **Commit your changes:**

   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your fork:**

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**

## Pull Request Guidelines

- Include a clear description of the problem and solution
- Reference any related issues
- Add tests for new functionality
- Update documentation as needed
- Ensure CI passes

## Project Structure

```
qa-director/
├── src/
│   ├── cli/          # CLI commands
│   ├── core/         # Core functionality
│   ├── types/        # Type definitions
│   └── utils/        # Utility functions
├── tests/            # Test files
└── dist/            # Built output
```

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions in existing issues
- Check the README for usage examples

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct (see CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
