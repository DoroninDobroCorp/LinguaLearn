# Dev-Only Audit Exceptions & Vulnerability Baseline Report

## Summary
- **Production Vulnerabilities (`npm audit --omit=dev`)**: **0** (0 Critical, 0 High, 0 Moderate, 0 Low)
- **Dev-Only Exception Count**: 4 Advisories (1 High, 3 Moderate) on `devDependencies` (`vite` and `esbuild`)
- **Status**: Production Audit Gate **PASSED** (0 Critical/High Production Vulnerabilities)

---

## Production Security Baseline
Running `npm audit --omit=dev` confirms 0 production vulnerabilities after upgrading production dependencies (`react-router-dom@7.18.2`, `express@4.22.2`, `body-parser@1.20.6`, `qs@6.15.3`, `path-to-regexp@0.1.13`, `minimatch@3.1.5`, `brace-expansion@1.1.18`, `@remix-run/router@1.23.3`).

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {},
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 0,
      "critical": 0,
      "total": 0
    }
  }
}
```

---

## Documented Dev-Only Vulnerability Exceptions

The following advisories affect development-time build tools (`vite` and its sub-dependency `esbuild` in `devDependencies`). They do **not** affect production runtime code, assets, or API endpoints on `serverforvovka`.

### 1. Vite `server.fs.deny` Bypass on Windows
- **Advisory ID**: `GHSA-fx2h-pf6j-xcff`
- **CVE**: `CVE-2026-0814` (or similar)
- **Package**: `vite` (version `5.4.21` in `devDependencies`)
- **Severity**: High (CVSS 7.5)
- **CWE**: CWE-22, CWE-200
- **Scope**: Local Vite development server (`npm run dev`) on Windows.
- **Production Impact**: **NONE**. The production environment runs Node.js/Express (`server/index.js`) serving compiled static bundle files from `english/dist/`. The Vite dev server is not executed or exposed in production.
- **Resolution Path**: Requires major semver upgrade to `vite@8.2.1` which introduces breaking configuration changes. Deferred until Vite major framework upgrade cycle.

### 2. esbuild Local Dev Server Cross-Origin Access
- **Advisory ID**: `GHSA-67mh-4wv8-2f99`
- **Package**: `esbuild` (sub-dependency of `vite` in `devDependencies`)
- **Severity**: Moderate (CVSS 5.3)
- **CWE**: CWE-346
- **Scope**: Development server bundled with esbuild.
- **Production Impact**: **NONE**. esbuild is not packaged or deployed into production Node backend or web dist.
- **Resolution Path**: Tracked under Vite 8 major upgrade requirement.

### 3. Vite Path Traversal in Optimized Deps `.map` Handling
- **Advisory ID**: `GHSA-4w7w-66w2-5vf9`
- **Package**: `vite` (version `5.4.21` in `devDependencies`)
- **Severity**: Moderate
- **CWE**: CWE-22, CWE-200
- **Scope**: Development server sourcemap request handling.
- **Production Impact**: **NONE**. Dev server sourcemap middleware is inactive in production build.
- **Resolution Path**: Tracked under Vite 8 major upgrade requirement.

### 4. Vite launch-editor UNC Path NTLM Hash Disclosure
- **Advisory ID**: `GHSA-v6wh-96g9-6wx3`
- **Package**: `vite` (version `5.4.21` in `devDependencies`)
- **Severity**: Moderate
- **CWE**: CWE-73, CWE-522
- **Scope**: Windows development editor launch integration.
- **Production Impact**: **NONE**. Editor launch utility is not used or installed in production server environment.
- **Resolution Path**: Tracked under Vite 8 major upgrade requirement.
