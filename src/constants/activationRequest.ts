/**
 * "Attiva una nuova utenza" requests: cases opened from the app with no bill,
 * which the operator works by phone.
 *
 * A request is picked up from its own page while it is `new`. From then on it
 * is a full case, and may be set to any of these statuses, forward or back.
 */

export const ACTIVATION_REQUEST_CASE_TYPES = ["new_activation", "takeover"] as const;

export type ActivationRequestStatus =
  | "new"
  | "in_progress"
  | "documents_pending"
  | "contract_sent"
  | "awaiting_activation"
  | "activated"
  | "rejected"
  | "cancelled";

export const ACTIVATION_REQUEST_STATUSES: ActivationRequestStatus[] = [
  "new",
  "in_progress",
  "documents_pending",
  "contract_sent",
  "awaiting_activation",
  "activated",
  "rejected",
  "cancelled",
];

/** The status dropdown on the full case. */
export const ACTIVATION_STATUS_GROUPS: { label: string; statuses: ActivationRequestStatus[] }[] = [
  { label: "activation_requests.groups.working", statuses: ["new", "in_progress", "documents_pending"] },
  { label: "case_management.steps.contract", statuses: ["contract_sent"] },
  { label: "case_management.steps.activation", statuses: ["awaiting_activation", "activated"] },
  { label: "activation_requests.groups.closed", statuses: ["rejected", "cancelled"] },
];

/** The steps a case passes through. KO and the other stops are not among them. */
export const ACTIVATION_CASE_STEPS: ActivationRequestStatus[] = [
  "in_progress",
  "contract_sent",
  "awaiting_activation",
  "activated",
];

/** Which step a status sits on, or -1 for a case that has closed. */
export const activationCaseStep = (status: string): number => {
  if (status === "new" || status === "documents_pending") return 0;
  return ACTIVATION_CASE_STEPS.indexOf(status as ActivationRequestStatus);
};

export const isActivationRequestType = (caseType: string | null | undefined) =>
  !!caseType &&
  (ACTIVATION_REQUEST_CASE_TYPES as readonly string[]).includes(caseType);

/** Ant Design tag colour per status. */
export const ACTIVATION_REQUEST_STATUS_COLOR: Record<ActivationRequestStatus, string> = {
  new: "purple",
  in_progress: "blue",
  documents_pending: "orange",
  contract_sent: "gold",
  awaiting_activation: "processing",
  activated: "green",
  rejected: "red",
  cancelled: "default",
};
