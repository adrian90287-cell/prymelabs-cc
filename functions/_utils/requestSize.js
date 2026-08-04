// Request size validation middleware

const MAX_BODY_SIZE = 1024 * 1024; // 1MB default limit
const MAX_JSON_SIZE = 512 * 1024;  // 512KB for JSON payloads
const MAX_FORM_SIZE = 256 * 1024;  // 256KB for form data

export function validateRequestSize(request, maxSize = MAX_BODY_SIZE) {
  const contentLength = request.headers.get('content-length');

  if (contentLength) {
    const size = parseInt(contentLength);
    if (size > maxSize) {
      return {
        valid: false,
        error: `Request body exceeds ${maxSize / 1024}KB limit`,
        statusCode: 413 // Payload Too Large
      };
    }
  }

  return { valid: true };
}

export function getMaxSizeForContentType(contentType) {
  if (!contentType) return MAX_BODY_SIZE;

  if (contentType.includes('application/json')) return MAX_JSON_SIZE;
  if (contentType.includes('multipart/form-data')) return MAX_FORM_SIZE;
  if (contentType.includes('application/x-www-form-urlencoded')) return MAX_FORM_SIZE;

  return MAX_BODY_SIZE;
}

export async function validateRequestBody(request) {
  const contentType = request.headers.get('content-type') || '';
  const maxSize = getMaxSizeForContentType(contentType);

  const validation = validateRequestSize(request, maxSize);
  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
      statusCode: validation.statusCode
    };
  }

  return { valid: true };
}
