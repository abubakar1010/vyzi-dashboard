/**
 * "Attiva una nuova utenza" requests: cases opened from the app with no bill,
 * which the operator completes by phone.
 *
 * The status path mirrors the backend's `activation-request-transitions.ts`.
 * The server enforces it; the dashboard only uses it to offer the moves that
 * will be accepted.
 */

export const ACTIVATION_REQUEST_CASE_TYPES = ["new_activation", "takeover"] as const;

export type ActivationRequestStatus =
  | "new"
  | "in_progress"
  | "awaiting_activation"
  | "activated"
  | "cancelled"
  | "rejected";

export const ACTIVATION_REQUEST_STATUSES: ActivationRequestStatus[] = [
  "new",
  "in_progress",
  "awaiting_activation",
  "activated",
  "cancelled",
  "rejected",
];

/** The one forward move from each open status. */
export const NEXT_ACTIVATION_REQUEST_STATUS: Partial<
  Record<ActivationRequestStatus, ActivationRequestStatus>
> = {
  new: "in_progress",
  in_progress: "awaiting_activation",
  awaiting_activation: "activated",
};

export const isOpenActivationRequest = (status: string) =>
  status in NEXT_ACTIVATION_REQUEST_STATUS;

export const isActivationRequestType = (caseType: string | null | undefined) =>
  !!caseType &&
  (ACTIVATION_REQUEST_CASE_TYPES as readonly string[]).includes(caseType);

/** Ant Design tag colour per status. */
export const ACTIVATION_REQUEST_STATUS_COLOR: Record<ActivationRequestStatus, string> = {
  new: "purple",
  in_progress: "blue",
  awaiting_activation: "gold",
  activated: "green",
  cancelled: "default",
  rejected: "red",
};
