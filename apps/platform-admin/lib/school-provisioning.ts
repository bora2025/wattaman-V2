export const PROVISIONING_STATUSES = [
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROVISIONING', 'READY',
  'FAILED_RETRYABLE', 'CANCELLED',
] as const;

export type ProvisioningStatus = typeof PROVISIONING_STATUSES[number];

export interface ProvisioningAttempt {
  id: string;
  attemptNumber: number;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  workerId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  checkpoints: Array<{ id: string; name: string; status: 'SUCCEEDED' | 'FAILED'; metadata: unknown; completedAt: string | null; createdAt: string }>;
}

export interface ProvisioningRequest {
  id: string;
  customerSchoolId: string;
  status: ProvisioningStatus;
  targetWorkspaceId: string;
  environment: string;
  region?: string | null;
  releaseVersion: string;
  apiImage: string;
  webImage: string;
  gatewayImage: string;
  requestedDomain: string | null;
  requestedByOperatorId: string;
  approvedByOperatorId: string | null;
  approvalExpiresAt: string | null;
  lastSuccessfulCheckpoint: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  school: { id: string; name: string; slug: string; status: string };
  requestedBy: { id: string; displayName: string };
  approvedBy: { id: string; displayName: string } | null;
  attempts?: ProvisioningAttempt[];
}

export function humanStatus(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}
