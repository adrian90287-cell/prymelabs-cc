# 🚨 Incident Response Runbook

**Status:** For Use In Production  
**Last Updated:** August 3, 2026  
**Severity Levels:** CRITICAL > HIGH > MEDIUM

---

## Quick Reference

| Incident | Response Time | Escalation |
|----------|---|---|
| Brute force attack (50+ failed logins) | 30 min | Alert ops@prymelabs.net |
| Unauthorized access attempt | 15 min | Alert security@prymelabs.net |
| Rate limit abuse | 1 hour | Investigate + block if needed |
| Token validation failures | 30 min | Check logs + auth system |
| Potential XSS/SQL injection | IMMEDIATE | Block IP + investigate |

---

## Incident 1: Brute Force Attack (50+ Failed Logins)

### Severity: HIGH

### Detection
- Security logs show multiple `auth_failure` events
- HTTP 429 responses appearing
- Same IP, short time window
- Example log:
```
[SECURITY] auth_failure - ip: 192.168.1.100, reason: invalid_password, endpoint: admin/session
[SECURITY] rate_limit_exceeded - ip: 192.168.1.100, operation: admin/session
```

### Immediate Actions (0-5 min)
1. **Confirm the incident**
   - Check Cloudflare dashboard → Workers → Logs
   - Filter for: `auth_failure` events in last 10 minutes
   - Note: IP address, timestamp, count of failures

2. **Determine if internal or external**
   - Is IP from your office/home? → Likely misconfigured tool
   - Is IP foreign? → Likely attack

3. **Take no action yet** - Rate limiting is already protecting you

### Investigation (5-30 min)
1. **Check what was targeted**
   ```
   Look for: What endpoints were attacked?
   - /api/admin/session = login attempts
   - /api/admin/dashboard = API access attempts
   - Other admin endpoints = broad attack
   ```

2. **Check for success**
   ```
   Look for: Did any requests succeed (200)?
   - All 401/429 = attack blocked
   - Some 200 = possible compromise (CRITICAL)
   ```

3. **Check attack pattern**
   ```
   Look for: How many attempts per minute?
   - 50+ per min = automated tool
   - 2-5 per min = manual attempts or slow script
   ```

### Response (30+ min)

**If Internal (Misconfigured Tool):**
1. Contact developer/team using the tool
2. Review what script/tool is making requests
3. Adjust rate limits if legitimate use case
4. Document incident

**If External (Attack):**
1. **Immediate:** Nothing needed (rate limit already protecting)
2. **Optional:** Block IP via Cloudflare dashboard
   - Go to: Security → IP Lists
   - Add IP to blocklist
   - Monitor for 24 hours

3. **Monitor:** Watch for patterns from other IPs (distributed attack)

4. **Report:** Email security@prymelabs.net with:
   - Time of incident
   - Attacking IP(s)
   - Number of attempts
   - Which endpoints targeted
   - Whether any succeeded

### Resolution
- Rate limiting naturally expires attack (60 seconds)
- No customer data was accessed
- No system damage
- Document for future reference

### Post-Incident (1-7 days)
- Review logs for similar patterns
- Consider IP blocking if repeated
- Update team on incident
- No action needed if one-time

---

## Incident 2: Unauthorized Access Attempt

### Severity: HIGH

### Detection
- Security log: `unauthorized_access` or `invalid_token`
- User/system trying to access admin endpoint without valid token
- Example log:
```
[SECURITY] unauthorized_access - ip: 192.168.1.101, endpoint: /api/admin/dashboard
[SECURITY] invalid_token - reason: missing_token
```

### Immediate Actions (0-5 min)
1. **Confirm occurrence**
   - Check Cloudflare logs
   - Note: IP, endpoint, timestamp

2. **Assess severity**
   - Single attempt: Likely accidental (not critical)
   - Multiple attempts: Potential reconnaissance

3. **No immediate action needed** - System already blocked it

### Investigation (5-30 min)
1. **Identify source**
   ```
   Is IP:
   - Your known IP? → Check if you're having trouble
   - Unknown? → Potential attacker
   ```

2. **What were they trying to access?**
   ```
   Check logs:
   - /api/admin/dashboard = trying to see orders/analytics
   - /api/admin/settings = trying to change configuration
   - /api/admin/products = trying to modify inventory
   ```

3. **Was there token in request?**
   ```
   - No token at all = web crawler or script
   - Invalid token = might have valid token but it expired
   - Malformed token = attacker guessing/brute forcing tokens
   ```

### Response

**If Single Attempt (Accidental):**
1. No action needed
2. If it was you: Try logging in again
3. Document timestamp

**If Multiple Attempts (Attack):**
1. Consider blocking IP via Cloudflare
2. Check if token exposure is possible
3. Consider password reset (if concerned)
4. Monitor for continued attempts

**If Malformed Token:**
1. Attacker is trying to guess tokens (won't work)
2. Completely harmless
3. Rate limit will kick in after many attempts
4. Document for pattern analysis

### Resolution
- System blocks all unauthorized requests
- No data accessible without valid token
- Document incident

---

## Incident 3: Rate Limit Abuse (User Locked Out)

### Severity: MEDIUM

### Detection
- User reports: "I got locked out"
- Error: "Too many login attempts. Try again in X second(s)."
- User trying to perform legitimate work

### Immediate Actions (0-5 min)
1. **Acknowledge to user**
   - "Rate limiting is protecting your account"
   - "Wait X seconds and try again"
   - Don't bypass or disable rate limits

2. **Determine cause**
   - User trying to log in repeatedly?
   - Script making multiple requests?
   - Browser autofill issue?

### Investigation (5-15 min)
1. **Check if legitimate use**
   - Why did they make 50+ requests in 60 seconds?
   - Script bug? Manual testing? Wrong password repeated?

2. **Check logs for context**
   ```
   Look for: Pattern of requests
   - All from same IP? = User or their tool
   - All failed (401)? = Wrong password attempts
   - Mixed success/failure? = Script bug
   ```

### Response

**If User Accidentally Triggered It:**
1. Explain rate limiting
2. Ask them to wait 60 seconds
3. Suggest: Don't retry rapidly, use different tool/approach
4. Document incident

**If Script/Tool Issue:**
1. Identify what script is making requests
2. Fix the script (reduce retry frequency, fix logic)
3. Test with longer delays between requests
4. Redeploy fixed script

**If Legitimate High-Volume Use:**
1. Contact security team
2. Review workflow (might be inefficient)
3. Consider alternatives (bulk operations vs. repeated requests)
4. May adjust rate limits with approval

### Resolution
- Rate limit expires naturally (60 seconds)
- User can proceed
- Document for pattern analysis

---

## Incident 4: Potential Security Breach (Suspicious Activity)

### Severity: CRITICAL

### Detection
- Logs showing: `xss_attempt`, `sql_injection_attempt`, or `csrf_failure`
- OR: Multiple `unauthorized_access` + at least one `200 OK`
- Example: Attack succeeded in accessing data

### Immediate Actions (0-2 min)
1. **STOP:** If data was accessed, stop everything else
2. **ALERT:** Email security@prymelabs.net with:
   - "CRITICAL: Potential breach detected"
   - Time of incident
   - What was accessed
   - IP address

3. **PRESERVE:** Don't clear logs
   - Cloudflare automatically preserves them
   - Screenshot suspicious logs

### Investigation (2-30 min)
1. **Determine scope**
   - What data was accessed?
   - How long was access available?
   - Are customer records exposed?

2. **Check logs thoroughly**
   ```
   Questions to answer:
   - How many successful accesses (200 OK)?
   - What endpoints were hit?
   - What data do those endpoints expose?
   - Was data modified or just read?
   ```

3. **Check system health**
   - Are there any suspicious changes in database?
   - Any unusual transactions or orders?
   - Any modified settings?

### Response
1. **Immediate containment**
   - Block the attacking IP
   - Review and reset admin password
   - Check for token theft

2. **Notification** (if customer data accessed)
   - Prepare notification to customers
   - Consult legal/compliance team
   - Have security team approve message

3. **Investigation with forensics**
   - Export full logs from Cloudflare
   - Review database audit trails
   - Check for backdoors or persistent access

4. **Remediation**
   - Patch if vulnerability exists
   - Update security measures
   - Audit all other endpoints

### Resolution
- Only after investigation confirms scope
- Document everything
- Prepare incident report
- Schedule postmortem meeting

---

## Quick Action Buttons

### Immediate Response Checklist

```
□ VERIFY incident in logs
□ DETERMINE severity level
□ ASSESS impact on customers
□ NOTIFY relevant team
□ PRESERVE evidence (screenshots/logs)
□ MONITOR for continuation
□ DOCUMENT timeline
□ ESCALATE if CRITICAL
□ POSTMORTEM after resolution
```

### Command Reference

**View Security Logs:**
```bash
# Cloudflare Dashboard
1. Go to: Workers → Logs
2. Filter by: [SECURITY]
3. Sort by: Time (newest first)
```

**Block IP Address:**
```bash
# Cloudflare Dashboard
1. Go to: Security → IP Lists
2. Click: Create IP List
3. Add IP address
4. Apply to: All zones
5. Set duration (24h, 1 week, permanent)
```

**View Failed Logins:**
```bash
# Cloudflare Logs
Filter: auth_failure
Look for: Same IP, rapid sequence
```

**Check Authorization Issues:**
```bash
# Cloudflare Logs
Filter: unauthorized_access OR invalid_token
Look for: Multiple attempts, different endpoints
```

---

## Escalation Matrix

### When to Notify

**Security Team** (security@prymelabs.net):
- Any `xss_attempt` or `sql_injection_attempt`
- Multiple `unauthorized_access` events with any successes
- Suspicion of account compromise
- Response time: < 30 min

**Operations Team** (ops@prymelabs.net):
- Brute force attack (50+ attempts)
- Rate limit abuse on shared infrastructure
- Potential DoS attack
- Response time: < 1 hour

**Management** (admin@prymelabs.net):
- Customer data accessed without authorization
- Multiple incidents in 24 hours
- Media/public awareness of incident
- Response time: < 30 min

**Vendors/Partners:**
- If incident involves third-party services
- After determining actual breach occurred
- Only with legal approval

---

## Post-Incident

### Incident Report Template

```
# Incident Report: [Date] - [Type]

## Summary
[1-2 sentence description]

## Timeline
- HH:MM: Incident detected
- HH:MM: Initial investigation
- HH:MM: Containment action taken
- HH:MM: Root cause identified
- HH:MM: Resolved

## Impact
- Duration: X minutes
- Data accessed: [list]
- Customers affected: [number]
- Severity: [CRITICAL/HIGH/MEDIUM/LOW]

## Root Cause
[What happened and why]

## Resolution
[What was done to stop it]

## Prevention
[How to prevent recurrence]

## Follow-up
[Any ongoing actions required]
```

### Postmortem Meeting
1. Schedule within 24 hours
2. Attendees: Security, Operations, Engineering
3. Review: Timeline, impact, root cause
4. Action items: Prevent recurrence
5. Document findings

---

## Contact Information

**Security Team:** security@prymelabs.net (URGENT: < 30 min)  
**Operations Team:** ops@prymelabs.net (< 1 hour)  
**Management:** admin@prymelabs.net (on-call)  
**Escalation:** If no response in specified time, call backup

---

**Last Updated:** August 3, 2026  
**Next Review:** February 3, 2027
