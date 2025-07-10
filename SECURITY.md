# Security Policy

## Supported Versions

We actively support the following versions of QA Director:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

### 🔒 Private Disclosure

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please:

1. **Email**: Send details to kush@trycheckpoint.ai
2. **Subject**: Use "QA Director Security Vulnerability" as the subject line
3. **Details**: Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

### 🕒 Response Timeline

- **24 hours**: Initial acknowledgment
- **7 days**: Detailed response and assessment
- **30 days**: Fix and disclosure timeline

### 🛡️ Security Best Practices

When using QA Director:

#### Environment Variables

- **Never commit** `.env.qa` files to version control
- **Use strong, unique passwords** for test accounts
- **Rotate credentials regularly** in CI/CD environments
- **Limit test account permissions** to minimum required

#### Authentication Storage

- **Review storage state files** before committing
- **Use separate test environments** for security testing
- **Avoid using production credentials** in tests

#### CI/CD Security

- **Use encrypted secrets** in GitHub Actions
- **Limit repository access** to necessary team members
- **Regularly audit** workflow permissions

#### Browser Automation

- **Be cautious with sensitive data** during test generation
- **Review generated tests** before running in production
- **Use headless mode** in CI environments

### 🔍 Security Considerations

#### API Keys

- QA Director requires an Anthropic API key for Claude Code integration
- Store API keys securely using environment variables
- Monitor API usage and set appropriate limits

#### Test Data

- Avoid using real user data in tests
- Use mock data or dedicated test accounts
- Regularly clean up test data

#### Network Security

- Be aware that tests may interact with external services
- Use network monitoring in production environments
- Consider using VPNs for sensitive test environments

### 📋 Security Checklist

Before deploying QA Director:

- [ ] Environment variables are properly configured
- [ ] Test accounts have minimal required permissions
- [ ] Storage state files are excluded from version control
- [ ] API keys are stored securely
- [ ] CI/CD secrets are encrypted
- [ ] Network access is properly restricted
- [ ] Test data is anonymized or synthetic

### 🤝 Acknowledgments

We appreciate security researchers who responsibly disclose vulnerabilities. Contributors will be acknowledged in our security advisories (with permission).

### 📞 Contact

For security-related questions:

- Email: kush@trycheckpoint.ai
- GitHub: Open a general issue (not for vulnerabilities)

---

_This security policy is subject to updates. Please check back regularly for the latest version._
