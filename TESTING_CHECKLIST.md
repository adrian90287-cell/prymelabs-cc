# 🧪 Security Testing Checklist

**Estimated Time:** 45-60 minutes  
**Date Tested:** ________________  
**Tested By:** ________________  
**Pass/Fail:** ________________

---

## Phase 1: Authentication (15 min)

### Test 1.1: Admin Login with Valid Password
- [ ] Navigate to https://prymelabs.cc/admin
- [ ] Enter correct admin password
- [ ] Verify: Page redirects to admin dashboard
- [ ] Verify: sessionStorage contains `pl_admin_token`
- [ ] Verify: Token looks like JWT (three parts separated by dots)
- [ ] Notes: _______________

### Test 1.2: Admin Login with Invalid Password
- [ ] Navigate to https://prymelabs.cc/admin
- [ ] Enter incorrect password
- [ ] Verify: Error message appears: "Invalid password"
- [ ] Verify: No token in sessionStorage
- [ ] Verify: Still on login page
- [ ] Notes: _______________

### Test 1.3: Session Persistence
- [ ] Log in successfully
- [ ] Open another tab in same browser
- [ ] Navigate to https://prymelabs.cc/admin
- [ ] Verify: Already logged in (no login prompt)
- [ ] Verify: Same token in sessionStorage
- [ ] Notes: _______________

### Test 1.4: Session Isolation
- [ ] Log in on Tab A
- [ ] Open new private/incognito window (Tab B)
- [ ] Navigate to https://prymelabs.cc/admin
- [ ] Verify: Tab B shows login page (not logged in)
- [ ] Verify: Tab B has different sessionStorage
- [ ] Notes: _______________

---

## Phase 2: Rate Limiting (15 min)

### Test 2.1: Rate Limit on Login Attempts
- [ ] Use developer tools to throttle to "Slow 4G"
- [ ] Try to log in 51+ times in 60 seconds
- [ ] After 50 attempts, verify: HTTP 429 response
- [ ] Verify: Error message mentions "Too many login attempts"
- [ ] Wait 60 seconds
- [ ] Try login again
- [ ] Verify: Login works after cooldown period
- [ ] Notes: _______________

### Test 2.2: Rate Limit on Admin Dashboard
- [ ] Log in successfully
- [ ] Use browser dev tools Network tab
- [ ] Refresh dashboard page 51+ times in 60 seconds
- [ ] After 50 requests, verify: HTTP 429 responses
- [ ] Wait 60 seconds
- [ ] Refresh dashboard
- [ ] Verify: Request succeeds
- [ ] Notes: _______________

### Test 2.3: Rate Limit is Per-IP
- [ ] Log in from home Wi-Fi (IP A)
- [ ] Trigger rate limit (HTTP 429)
- [ ] Switch to mobile hotspot (IP B)
- [ ] Try to log in
- [ ] Verify: Login works (new IP doesn't share rate limit)
- [ ] Notes: _______________

---

## Phase 3: CSRF Token (10 min)

### Test 3.1: CSRF Token Generation
- [ ] Navigate to https://prymelabs.cc/admin
- [ ] Open browser console
- [ ] Run: `fetch('/api/csrf-token').then(r => r.json()).then(d => console.log(d))`
- [ ] Verify: Response includes `token` and `sessionId`
- [ ] Verify: Token has 4 parts (token.sessionId.timestamp.signature)
- [ ] Notes: _______________

### Test 3.2: CSRF Token Binding
- [ ] Get a CSRF token
- [ ] Note the token and sessionId
- [ ] Try to use token from different browser/IP
- [ ] (This will fail until CSRF is integrated into forms)
- [ ] Verify: Token includes session-specific data
- [ ] Notes: _______________

---

## Phase 4: Age Gate (10 min)

### Test 4.1: Age Gate on Public Pages
- [ ] Clear sessionStorage
- [ ] Navigate to https://prymelabs.cc/shop
- [ ] Verify: Age verification dialog appears
- [ ] Verify: Cannot access page without verification
- [ ] Notes: _______________

### Test 4.2: Age Verification Token
- [ ] Click "I Am 21 or Older"
- [ ] Check sessionStorage
- [ ] Verify: `pl_age_token` is set
- [ ] Verify: Token looks like JWT (three parts)
- [ ] Navigate away and back
- [ ] Verify: Age gate doesn't appear again
- [ ] Notes: _______________

### Test 4.3: Age Gate Bypass Attempt
- [ ] Clear `pl_age_token` from sessionStorage
- [ ] Try to manually set: `sessionStorage.pl_age_verified = '1'`
- [ ] Refresh page
- [ ] Verify: Age gate still appears (old bypass doesn't work)
- [ ] Notes: _______________

---

## Phase 5: Security Logging (10 min)

### Test 5.1: Auth Failure Logging
- [ ] Open Cloudflare dashboard → Workers → Logs
- [ ] Try to log in with invalid password
- [ ] Check logs for security event
- [ ] Verify: Event type is `auth_failure`
- [ ] Verify: IP address is logged
- [ ] Verify: Timestamp is recent
- [ ] Notes: _______________

### Test 5.2: Rate Limit Event Logging
- [ ] Trigger rate limit (attempt 50+ logins)
- [ ] Check Cloudflare logs
- [ ] Verify: Event type is `rate_limit_exceeded`
- [ ] Verify: Includes operation name and attempt count
- [ ] Notes: _______________

### Test 5.3: Log Format
- [ ] Find a security event in logs
- [ ] Verify: Has timestamp, type, severity, details
- [ ] Verify: Includes IP address
- [ ] Verify: Includes operation or endpoint
- [ ] Notes: _______________

---

## Phase 6: Timing & Performance (5 min)

### Test 6.1: Login Response Time
- [ ] Open Network tab
- [ ] Log in
- [ ] Check `/api/admin/session` request time
- [ ] Verify: Response time < 500ms
- [ ] Verify: No timeout or 504 errors
- [ ] Notes: _______________

### Test 6.2: Token Validation Speed
- [ ] Trigger multiple admin API calls in rapid succession
- [ ] Check that all complete < 100ms per request
- [ ] Verify: Constant-time comparison doesn't cause delays
- [ ] Notes: _______________

---

## Phase 7: Security Headers (5 min)

### Test 7.1: CSP Header
- [ ] Navigate to https://prymelabs.cc/
- [ ] Open Network tab
- [ ] Check response headers
- [ ] Verify: `Content-Security-Policy` header present
- [ ] Verify: Does NOT include `unsafe-inline`
- [ ] Verify: `script-src 'self'` is set
- [ ] Notes: _______________

### Test 7.2: HSTS Header
- [ ] Check response headers
- [ ] Verify: `Strict-Transport-Security` header present
- [ ] Verify: Includes `preload` directive
- [ ] Notes: _______________

### Test 7.3: Other Security Headers
- [ ] Verify: `X-Frame-Options: DENY`
- [ ] Verify: `X-Content-Type-Options: nosniff`
- [ ] Verify: `X-XSS-Protection` header
- [ ] Notes: _______________

---

## Phase 8: Edge Cases (10 min)

### Test 8.1: Expired Token Handling
- [ ] Log in
- [ ] Copy the token
- [ ] Wait 8+ hours (or manually expire in testing)
- [ ] Try to use expired token
- [ ] Verify: HTTP 401 Unauthorized
- [ ] Verify: Admin page shows login prompt
- [ ] Notes: _______________

### Test 8.2: Malformed Token
- [ ] Try to use a random string as token
- [ ] Verify: HTTP 401 Unauthorized
- [ ] Verify: Security logged
- [ ] Notes: _______________

### Test 8.3: Request Size Limit
- [ ] Create a payload > 512KB
- [ ] Try to POST to `/api/admin/session`
- [ ] Verify: HTTP 413 Payload Too Large
- [ ] Notes: _______________

---

## Overall Assessment

### Scoring:
- **18-20 tests passing:** ✅ All security measures working
- **16-17 tests passing:** ⚠️ Minor issues, review failures
- **< 16 tests passing:** ❌ Critical issues, DO NOT DEPLOY

### Conclusion:
```
All tests: PASS / FAIL / PARTIAL

Issues found:
[List any failures]

Recommendations:
[List any follow-ups]
```

### Sign-Off:
- **Tested By:** _________________ **Date:** _________
- **Reviewed By:** _________________ **Date:** _________
- **Approved For Production:** [ ] Yes  [ ] No

---

## Notes & Issues

```
[Space for detailed notes about failures, unexpected behavior, or observations]




```

---

## Troubleshooting

### If Test 2.1 Fails (Rate Limiting Not Working)
1. Check that you're using correct endpoint: `/api/admin/session`
2. Verify 60-second window resets after first attempt
3. Check if rate limiter is tracking by IP correctly
4. Try from different IP to verify per-IP tracking

### If Test 4.3 Fails (Age Gate Bypass Works)
1. Check browser console for errors
2. Verify token validation is hitting server
3. Check that `pl_age_token` is actually being validated
4. Clear browser cache and try again

### If Tests 5.x Fail (Logging Not Working)
1. Verify Cloudflare Worker logs are enabled
2. Check that you're looking in correct project (prymelabs-cc)
3. Try triggering event and check logs within 30 seconds
4. Look for `[SECURITY]` prefix in logs

### If Test 7.1 Fails (CSP Header Missing)
1. Check that you're testing production, not localhost
2. Verify deployment completed successfully
3. Cloudflare CDN cache might need purge (give 5-10 minutes)
4. Hard refresh browser (Ctrl+Shift+R)

---

**Document this page after testing and file as evidence of security validation.**
