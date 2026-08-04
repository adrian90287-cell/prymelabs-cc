// Security event logging for monitoring and alerting

const SECURITY_EVENT_TYPES = {
  AUTH_FAILURE: 'auth_failure',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INVALID_TOKEN: 'invalid_token',
  TOKEN_EXPIRED: 'token_expired',
  CSRF_FAILURE: 'csrf_failure',
  REQUEST_SIZE_EXCEEDED: 'request_size_exceeded',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  XSS_ATTEMPT: 'xss_attempt',
  SQL_INJECTION_ATTEMPT: 'sql_injection_attempt'
};

export function logSecurityEvent(eventType, details = {}) {
  const timestamp = new Date().toISOString();
  const event = {
    type: eventType,
    timestamp,
    severity: getSeverity(eventType),
    details,
    context: {
      environment: typeof process !== 'undefined' ? process.env.NODE_ENV : 'production'
    }
  };

  // Log to console (will be captured by Cloudflare)
  console.warn(`[SECURITY] ${eventType}`, JSON.stringify(event));

  return event;
}

function getSeverity(eventType) {
  const criticalEvents = [
    SECURITY_EVENT_TYPES.CSRF_FAILURE,
    SECURITY_EVENT_TYPES.SQL_INJECTION_ATTEMPT,
    SECURITY_EVENT_TYPES.XSS_ATTEMPT
  ];

  const highEvents = [
    SECURITY_EVENT_TYPES.UNAUTHORIZED_ACCESS,
    SECURITY_EVENT_TYPES.INVALID_TOKEN
  ];

  if (criticalEvents.includes(eventType)) return 'CRITICAL';
  if (highEvents.includes(eventType)) return 'HIGH';
  return 'MEDIUM';
}

export function logAuthFailure(ip, reason, details = {}) {
  return logSecurityEvent(SECURITY_EVENT_TYPES.AUTH_FAILURE, {
    ip,
    reason,
    userAgent: details.userAgent,
    ...details
  });
}

export function logRateLimitExceeded(ip, operation, details = {}) {
  return logSecurityEvent(SECURITY_EVENT_TYPES.RATE_LIMIT_EXCEEDED, {
    ip,
    operation,
    ...details
  });
}

export function logTokenFailure(reason, details = {}) {
  return logSecurityEvent(SECURITY_EVENT_TYPES.INVALID_TOKEN, {
    reason,
    ...details
  });
}

export function logSuspiciousActivity(description, details = {}) {
  return logSecurityEvent(SECURITY_EVENT_TYPES.SUSPICIOUS_ACTIVITY, {
    description,
    ...details
  });
}

export { SECURITY_EVENT_TYPES };
