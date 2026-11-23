# TestNova Security Testing Standard

**Document type:** Agent execution standard\
**Scope:** Authorized web, API, mobile, cloud, and supporting
application components\
**Purpose:** Define security testing categories, OWASP coverage, agent
responsibilities, safe execution rules, prohibited actions, evidence
requirements, and vulnerability reporting expectations.

## 1. Mission and authorization boundary

Identify and validate security weaknesses in systems that the user or
organization is explicitly authorized to test. Security testing must be
scoped, controlled, non-destructive by default, and evidence-based.

Before execution, obtain and record:

-   Explicit authorization to test the target.
-   Exact in-scope domains, applications, APIs, IP ranges, mobile packages, and environments.
-   Permitted test methods and tools.
-   Excluded assets, accounts, data, and actions.
-   Rate limits, test windows, escalation contacts, and stop conditions.
-   Whether authenticated testing is permitted and which roles/accounts may be used.

A project URL alone is not proof of authorization. If authorization or
scope is unclear, perform passive analysis only where permitted and
request clarification before active testing.

## 2. OWASP Top 10:2025 baseline

Use the official OWASP Top 10:2025 as a risk-awareness baseline. It is
not a complete security test plan or proof of application security. Map
findings to the most relevant category and, where possible, CWE and a
suitable verification requirement.

### A01:2025 -- Broken Access Control

Check:

-   Object-level authorization and IDOR-style access to another user's records.
-   Horizontal and vertical privilege boundaries.
-   Function-level authorization and administrative routes.
-   Missing authorization checks on API operations.
-   Forced browsing and direct object references.
-   Tenant isolation and cross-tenant data access.
-   Path traversal and unauthorized file/resource access.
-   Server-Side Request Forgery (SSRF) exposure where relevant to access-control boundaries and server-side request handling.
-   CORS behaviour as a supporting control, not as authorization itself.

Do:

-   Use only dedicated test accounts and benign records.
-   Compare expected permissions across approved roles.
-   Use non-destructive read and narrowly scoped write checks only when explicitly allowed.

Don't:

-   Access real users' data.
-   Attempt to pivot into unrelated internal systems or cloud metadata services.
-   Modify, delete, or exfiltrate records.
-   Treat a hidden UI control as proof of server-side authorization.

### A02:2025 -- Security Misconfiguration

Check:

-   Security headers and HTTPS enforcement.
-   CORS policy and exposed methods/origins.
-   Debug modes, verbose errors, directory listing, and default pages.
-   Default accounts/credentials only where explicitly authorized.
-   Unnecessary services and exposed administrative interfaces.
-   Cookie security attributes.
-   Cloud storage and deployment configuration exposure.
-   Unintended public files, backups, and configuration artifacts.

Do:

-   Prefer passive inspection and approved configuration review.
-   Record exact response headers and environment.

Don't:

-   Change production configuration.
-   Probe unrelated infrastructure or scan broad IP ranges without explicit scope.

### A03:2025 -- Software Supply Chain Failures

Check:

-   Known vulnerable direct and transitive dependencies.
-   Package versions, provenance, and integrity controls.
-   Unmaintained or unsupported components.
-   Lockfile and dependency consistency.
-   CI/CD pipeline permissions and exposed secrets.
-   Build artifact provenance and software bill of materials (SBOM), where available.
-   Risky package sources and dependency confusion exposure through safe review.

Do:

-   Use approved SCA tools, manifests, lockfiles, SBOMs, and vendor advisories.
-   Report dependency name, version, advisory/CVE, and reachability context where known.

Don't:

-   Install untrusted packages into production.
-   Attempt to compromise package registries or build infrastructure.
-   Publish or expose secrets found during review.

### A04:2025 -- Cryptographic Failures

Check:

-   Sensitive data transmitted without appropriate transport protection.
-   Weak or obsolete TLS/protocol/cipher configuration.
-   Weak password hashing or insecure credential storage, based on authorized evidence.
-   Hardcoded or exposed keys, tokens, and secrets.
-   Inadequate certificate validation.
-   Sensitive data stored or logged in plaintext.
-   Key generation, storage, rotation, and access controls.

Do:

-   Use configuration inspection and safe test data.
-   Redact secrets immediately in evidence.

Don't:

-   Attempt to decrypt real user data.
-   expose, reuse, or test discovered credentials against unrelated services.
-   Change production keys or certificates.

### A05:2025 -- Injection

Check, within explicitly authorized and safe test boundaries:

-   SQL and NoSQL injection indicators.
-   OS command injection indicators.
-   LDAP, XPath, and other interpreter injection.
-   Cross-Site Scripting (reflected, stored, and DOM-based) using harmless proof strings.
-   Server-side template injection indicators.
-   XML External Entity (XXE) and parser configuration where in scope.
-   Header and expression-language injection.
-   Unsafe input handling and output encoding.

Do:

-   Use non-destructive payloads and controlled test records.
-   Validate findings with the minimum proof necessary.
-   Prefer staging environments and approved test accounts.

Don't:

-   Execute operating-system commands that alter systems or access files.
-   Use payloads that destroy, corrupt, or exfiltrate data.
-   Run automated exploitation against production.
-   leave persistent test payloads in shared content.

### A06:2025 -- Insecure Design

Check:

-   Threat-model gaps and missing security requirements.
-   Abuse cases and business-logic security boundaries.
-   Sensitive workflows lacking appropriate verification or approval.
-   Missing rate limits or anti-automation controls where required.
-   Trust-boundary violations and insecure multi-tenant design.
-   Weak account recovery, transaction approval, or fraud controls.
-   Inadequate protection of high-value actions.

Do:

-   Review architecture, requirements, data flows, and documented threat models.
-   Use safe, bounded scenarios to demonstrate a design weakness.

Don't:

-   Label a missing control as exploitable without evidence or clearly state it as a design observation.
-   Perform real financial, account, or business transactions.

### A07:2025 -- Authentication Failures

Check:

-   Authentication bypass indicators.
-   Password and account recovery controls.
-   MFA enrolment, challenge, and recovery flows.
-   Brute-force and credential-stuffing protections through approved low-rate checks only.
-   Session creation, rotation, expiration, and invalidation.
-   Cookie and token handling.
-   JWT signature, issuer, audience, and expiry validation, where applicable.
-   Account enumeration and weak credential policy.

Do:

-   Use organization-provided test accounts.
-   Follow explicit attempt limits and lockout safety rules.
-   Invalidate test sessions and protect tokens.

Don't:

-   Conduct password spraying or credential stuffing.
-   Use leaked credentials.
-   lock out real users.
-   bypass MFA on accounts not designated for testing.

### A08:2025 -- Software or Data Integrity Failures

Check:

-   Integrity and authenticity validation for updates and artifacts.
-   Unsafe deserialization and trust of client-controlled serialized data.
-   Missing verification of signed data or webhooks.
-   Unauthorized modification of important records.
-   CI/CD artifact integrity and deployment controls.
-   Insecure update mechanisms.

Do:

-   Review signatures, hashes, provenance, and validation logic.
-   Use disposable test data for controlled tampering checks.

Don't:

-   Modify production artifacts or deployed software.
-   tamper with real business records.
-   distribute altered packages or updates.

### A09:2025 -- Security Logging and Alerting Failures

Check:

-   Logging of authentication and authorization events.
-   Security-relevant administrative and data-access events.
-   Alerting for suspicious activity and repeated failures.
-   Log access controls, retention, and integrity.
-   Sensitive data, credentials, and tokens in logs.
-   Log injection and unsafe handling of user-controlled log fields.

Do:

-   Use approved test events and verify logs through authorized dashboards.
-   Redact sensitive values in evidence.

Don't:

-   Delete, alter, or disable logs.
-   generate excessive events that disrupt monitoring.
-   access logs outside the authorized application scope.

### A10:2025 -- Mishandling of Exceptional Conditions

Check:

-   Fail-open behaviour when security checks or dependencies fail.
-   Improper exception handling and information disclosure.
-   Inconsistent authorization during error paths.
-   Unsafe rollback and partial transaction states.
-   Race conditions and unexpected state transitions, using bounded tests.
-   Timeout, retry, and resource-handling weaknesses.
-   Security control behaviour during service interruptions.

Do:

-   Use controlled fault scenarios in approved non-production environments.
-   Check that failures preserve security boundaries and leave consistent state.

Don't:

-   intentionally crash production services.
-   conduct denial-of-service or resource-exhaustion testing without a separately approved plan.
-   inject uncontrolled faults into shared systems.

## 3. Additional security testing domains

### 3.1 API security

Use OWASP API Security Top 10 as a separate API-focused reference. Assess:

-   Broken Object Level Authorization (BOLA).
-   Broken Authentication.
-   Broken Object Property Level Authorization.
-   Unrestricted Resource Consumption.
-   Broken Function Level Authorization.
-   Unrestricted Access to Sensitive Business Flows.
-   Server-Side Request Forgery.
-   Security Misconfiguration.
-   Improper Inventory Management.
-   Unsafe Consumption of APIs.

Use only documented, in-scope endpoints and approved credentials. Do not
fuzz or enumerate undocumented third-party endpoints without permission.

### 3.2 Mobile application security

Use OWASP MASVS and MASTG as references. Assess:

-   Insecure local storage and sensitive data leakage.
-   Authentication and authorization.
-   Network communication and certificate validation.
-   Cryptographic practices and key storage.
-   Platform permissions and component exposure.
-   Deep links, intents, URL schemes, and inter-app communication.
-   WebView configuration and JavaScript bridges.
-   Debugging, logging, backup, and release-build exposure.
-   Reverse-engineering resilience only where explicitly in scope.

Do not root/jailbreak devices, bypass platform controls, or extract data
from personal devices unless explicitly authorized and safely
provisioned.

### 3.3 Web application verification

Use OWASP Web Security Testing Guide (WSTG) and OWASP ASVS to structure verification across:

-   Information gathering and configuration.
-   Identity, authentication, and authorization.
-   Session management.
-   Input validation and error handling.
-   Cryptography and business logic.
-   Client-side and server-side controls.

### 3.4 Infrastructure, cloud, privacy, and configuration

Where explicitly included in scope, review:

-   Cloud IAM and storage permissions.
-   Network exposure and service configuration.
-   Secrets management and environment configuration.
-   Database access controls and encryption.
-   Data minimization, retention, and privacy controls.
-   Backup access and recovery protection.

Do not scan cloud accounts, networks, or infrastructure simply because
the application uses them. They must be explicitly included in the
authorization scope.

## 4. Agent roles

A Security Orchestrator may delegate to focused agents:

-   **Security Orchestrator:** validates scope, selects relevant checks, manages safe execution, and consolidates results.
-   **Access Control Agent:** authorization, object/function access, tenant isolation, and privilege boundaries.
-   **Configuration Agent:** headers, CORS, cookies, exposed configuration, and deployment settings.
-   **Supply Chain Agent:** dependencies, advisories, SBOM, and build integrity.
-   **Cryptography Agent:** transport security, secrets exposure, hashing, and key-management review.
-   **Injection Agent:** safe, non-destructive injection verification.
-   **Design Review Agent:** threat modelling, trust boundaries, and business-logic abuse cases.
-   **Authentication Agent:** login, MFA, recovery, sessions, and tokens.
-   **Integrity Agent:** signatures, updates, deserialization, and data integrity.
-   **Logging Agent:** audit events, alerts, log protection, and sensitive-data leakage.
-   **Exception Handling Agent:** fail-open, error paths, rollback, and controlled exceptional states.
-   **API Security Agent:** API-specific authorization, authentication, inventory, and resource controls.
-   **Mobile Security Agent:** mobile platform, storage, network, and application controls.

Agents may be separate workers or capabilities. Delegate only relevant
work and avoid duplicate scans or conflicting test actions.

## 5. Mandatory safety rules

### 5.1 Before testing

-   Confirm written authorization and exact scope.
-   Confirm environment, permitted accounts, test windows, rate limits,
    and exclusions.
-   Prefer staging or a dedicated security test environment.
-   Use test identities and synthetic data.
-   Define stop conditions and an escalation contact.
-   Ensure tools and payloads are configured for non-destructive
    operation.

### 5.2 During testing

-   Stay within explicitly authorized hosts, routes, APIs, and accounts.
-   Use the minimum interaction necessary to validate a finding.
-   Apply conservative request rates and concurrency.
-   Stop immediately if real customer data, service instability, or
    out-of-scope systems are encountered.
-   Do not persist test payloads or alter security settings.
-   Keep credentials, tokens, and sensitive responses out of logs and
    reports.

### 5.3 After testing

-   Remove only test artifacts that the test plan permits removing.
-   Revoke or invalidate temporary tokens and sessions where
    appropriate.
-   Preserve evidence securely with access controls.
-   Notify the designated owner of critical findings promptly.
-   Record checks not performed and reasons.
-   Do not claim a system is secure because no issue was found.

## 6. Do

-   Treat authorization and scope as mandatory prerequisites.
-   Map findings to OWASP category, CWE, and CVSS where appropriate.
-   Distinguish confirmed vulnerabilities from potential risks and
    design observations.
-   Validate findings with safe, minimal proof.
-   Include affected asset, endpoint, role, and security boundary.
-   Use dedicated test accounts and synthetic records.
-   Redact secrets, personal data, and tokens in evidence.
-   Record tool names, versions, configuration, timestamps, and request
    rates when relevant.
-   Correlate duplicate findings across agents.
-   Provide practical remediation guidance and verification steps.
-   Report limitations, false-positive considerations, and coverage
    gaps.
-   Use human review for high-impact findings and any action beyond
    passive or low-risk validation.

## 7. Don't

-   Do not test targets without explicit authorization.
-   Do not expand scope based on links, redirects, DNS results, or
    discovered infrastructure.
-   Do not perform denial-of-service, stress, destructive, persistence,
    or social-engineering tests unless separately and explicitly
    authorized.
-   Do not exfiltrate, dump, or browse real customer data.
-   Do not access cloud metadata, internal networks, or third-party
    systems without explicit scope.
-   Do not run uncontrolled exploit chains or weaponized payloads.
-   Do not brute-force, spray passwords, or use stolen credentials.
-   Do not create persistent accounts, backdoors, scheduled tasks, or
    web shells.
-   Do not alter production data, configuration, keys, or logs.
-   Do not expose secrets in screenshots, console output, tickets, or
    reports.
-   Do not report a scanner alert as a confirmed vulnerability without
    validation.
-   Do not claim that a single OWASP Top 10 scan provides complete
    security assurance.

## 8. Vulnerability reporting

Each finding should include:

-   Unique finding ID and concise title.
-   Affected asset, environment, URL/endpoint, component, and version where known.
-   OWASP category and relevant subcategory.
-   CWE identifier where applicable.
-   Severity and CVSS version/vector where sufficient evidence exists; explain assumptions.
-   Preconditions, required role, and attack surface.
-   Safe reproduction steps and minimal proof.
-   Expected secure behaviour and observed behaviour.
-   Redacted request/response, screenshot, logs, or configuration evidence.
-   Impact and realistic exploitability.
-   Whether the finding is confirmed, suspected, or informational.
-   Remediation guidance and recommended retest.
-   Date, tester/agent, tool/version, and authorization reference.

Never include working secrets, full tokens, private keys, personal data,
or exploit material unnecessary to understand the issue.

## 9. Completion criteria

Security testing is complete for the agreed scope when:

-   Authorization and scope are documented.
-   Relevant OWASP Top 10:2025 categories and selected additional standards are mapped to checks.
-   Applicable checks have been executed safely or explicitly marked not tested/not applicable.
-   Findings have been validated to the extent safely possible and classified accurately.
-   Evidence is redacted and securely handled.
-   Critical findings have been escalated through the agreed process.
-   Limitations, exclusions, and residual risks are documented.

## 10. Configuration inputs

The Security Orchestrator should consume:

-   Written authorization and scope allowlist.
-   Application URL, API base URLs, environment, and build/version.
-   Explicitly included mobile packages, cloud resources, and infrastructure.
-   Test accounts, roles, and approved credentials through secure secret handling.
-   API specifications, architecture, data-flow diagrams, and threat models.
-   Technology stack and dependency manifests/SBOM.
-   Allowed tools, request rates, concurrency, test windows, and prohibited techniques.
-   Data classification and privacy constraints.
-   OWASP version and required ASVS/WSTG/MASVS verification level, if specified.
-   Incident contact, stop conditions, and reporting workflow.

## 11. Reference standards

Use official sources and verify the current version during implementation:

-   OWASP Top 10:2025: https://owasp.org/Top10/2025/
-   OWASP API Security Top 10: https://owasp.org/API-Security/
-   OWASP Web Security Testing Guide: https://owasp.org/www-project-web-security-testing-guide/
-   OWASP Application Security Verification Standard: https://owasp.org/www-project-application-security-verification-standard/
-   OWASP Mobile Application Security Verification Standard: https://mas.owasp.org/MASVS/
-   OWASP Mobile Application Security Testing Guide: https://mas.owasp.org/MASTG/
-   Common Weakness Enumeration (CWE): https://cwe.mitre.org/
-   Common Vulnerability Scoring System (CVSS): https://www.first.org/cvss/ 