export type ReviewerMessageKey =
  | 'reviewer.error.evidence.invalidObject'
  | 'reviewer.error.evidence.missingChecks'
  | 'reviewer.error.evidence.missingRequirements'
  | 'reviewer.error.evidence.missingRequirementsNamed';

const enUS: Record<ReviewerMessageKey, string> = {
  'reviewer.error.evidence.invalidObject': 'Evidence must be a JSON object with named fields.',
  'reviewer.error.evidence.missingChecks': 'Add at least one check entry under checks[].',
  'reviewer.error.evidence.missingRequirements': 'High-risk decisions require artifacts[] and a non-empty ticket.',
  'reviewer.error.evidence.missingRequirementsNamed': 'Missing evidence requirement(s): {missing}.',
};

export type ReviewerApiErrorPayload = {
  error?: string;
  code?: string;
  details?: {
    missingRequirements?: string[];
    field?: string;
  };
};

function format(message: string, params?: Record<string, string>) {
  if (!params) return message;
  return Object.entries(params).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), message);
}

export function reviewerMessage(key: ReviewerMessageKey, params?: Record<string, string>) {
  return format(enUS[key], params);
}

export function reviewerEvidenceHint(payload: ReviewerApiErrorPayload): string {
  if (payload.code === 'REVIEW_EVIDENCE_INVALID_OBJECT') {
    return reviewerMessage('reviewer.error.evidence.invalidObject');
  }
  if (payload.code === 'REVIEW_EVIDENCE_MISSING_CHECKS') {
    return reviewerMessage('reviewer.error.evidence.missingChecks');
  }
  if (payload.code === 'REVIEW_EVIDENCE_MISSING_REQUIREMENTS') {
    const missing = Array.isArray(payload.details?.missingRequirements) ? payload.details?.missingRequirements : [];
    if (!missing.length) return reviewerMessage('reviewer.error.evidence.missingRequirements');
    return reviewerMessage('reviewer.error.evidence.missingRequirementsNamed', { missing: missing.join(', ') });
  }
  return '';
}
