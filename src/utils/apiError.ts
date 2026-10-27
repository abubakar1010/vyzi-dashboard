import i18n, { currentLanguage } from "../i18n";

/**
 * Turns a backend error into copy in the admin's language (Italian first).
 *
 * The API answers in English and the mobile app matches some of those English
 * strings, so the backend keeps them and the dashboard translates here: every
 * message the backend can throw maps to an `api_errors.*` key. A message that
 * is not in the catalogue never reaches an Italian admin raw; they get the
 * caller's fallback (or a status-based one) instead. Keep this list in step
 * with the backend's exceptions and DTO validation messages.
 */

type ParamKind = "value" | "list" | "billStatus" | "activationStatus";

type Rule = {
  match: string | RegExp;
  key: string;
  /** How to translate a named capture group before it is interpolated. */
  params?: Record<string, ParamKind>;
};

const rules: Rule[] = [
  // Generic HTTP / framework
  { match: "Internal server error", key: "server" },
  { match: "Unauthorized", key: "unauthorized" },
  { match: "Forbidden", key: "forbidden" },
  { match: "Forbidden resource", key: "forbidden" },
  { match: "Not Found", key: "not_found" },
  { match: /^Cannot (?:GET|POST|PUT|PATCH|DELETE) /, key: "not_found" },
  { match: /Too Many Requests/i, key: "too_many_requests" },
  { match: "Bad Request", key: "validation" },

  // Not found / access
  { match: "User not found", key: "user_not_found" },
  { match: "Bill not found", key: "bill_not_found" },
  { match: "Supplier not found", key: "supplier_not_found" },
  { match: "Ticket not found", key: "ticket_not_found" },
  { match: "Case not found", key: "case_not_found" },
  { match: "Offer not found", key: "offer_not_found" },
  { match: "FAQ not found", key: "faq_not_found" },
  { match: "Topic not found", key: "topic_not_found" },
  { match: "Topic not found or inactive", key: "topic_not_found_or_inactive" },
  { match: "Static page not found", key: "static_page_not_found" },
  { match: /^Page '(?<slug>.+)' not found$/, key: "page_not_found" },
  { match: "Notification not found", key: "notification_not_found" },
  { match: "Note not found", key: "note_not_found" },
  { match: "Document not found", key: "document_not_found" },
  { match: "Only a rejected document can be replaced", key: "only_rejected_document_replaceable" },
  { match: "This document has already been replaced", key: "document_already_replaced" },
  { match: "A note is required when the reason is other", key: "rejection_note_required" },
  { match: "Agreement not found", key: "agreement_not_found" },
  { match: "Referral not found", key: "referral_not_found" },
  { match: "Push token not found", key: "push_token_not_found" },
  { match: "Pending email bill not found", key: "pending_email_bill_not_found" },
  { match: "Notification template not found", key: "notification_template_not_found" },
  { match: "Meter not found", key: "meter_not_found" },
  { match: "Customer not found", key: "customer_not_found" },
  { match: "File not found", key: "file_not_found" },
  { match: /^(?:Bill file|Document file|File) not found on disk$/, key: "file_missing_on_server" },
  { match: "Access denied", key: "access_denied" },
  { match: "You do not have access to this bill", key: "bill_access_denied" },

  // Auth & account
  { match: "Invalid email or password", key: "invalid_credentials" },
  { match: "Email already registered", key: "email_already_registered" },
  { match: "Invalid or expired OTP code", key: "invalid_or_expired_otp" },
  { match: "Invalid or expired reset token", key: "invalid_or_expired_reset_token" },
  { match: /^Invalid (?:or expired )?verification token$/, key: "invalid_or_expired_verification_token" },
  { match: "Invalid or expired refresh token", key: "invalid_or_expired_refresh_token" },
  { match: "Either email or verificationToken is required", key: "email_or_token_required" },
  { match: "Either resetToken or email+code is required", key: "reset_token_or_code_required" },
  { match: "Phone verification OTP cannot be resent via this endpoint", key: "phone_otp_not_resendable" },
  { match: "Cannot register as admin", key: "cannot_register_as_admin" },
  { match: "Current password is incorrect", key: "current_password_incorrect" },
  { match: "New password and confirmation do not match", key: "password_mismatch" },
  { match: /^New password must be different from (?:your )?current password$/, key: "password_reused" },
  { match: "Cannot change password for social login accounts", key: "social_account_password" },
  { match: "Too many failed attempts. Please request a new code.", key: "too_many_attempts" },
  { match: /^Your account has been suspended/, key: "account_suspended" },
  { match: "This account has been deleted", key: "account_deleted" },
  { match: "Password is required to delete the account", key: "delete_account_password_required" },
  { match: "Password is incorrect", key: "password_incorrect" },
  { match: "Admin accounts cannot be deleted from the app", key: "admin_account_not_deletable" },
  { match: /^(?:Your email is not verified|Email not verified)/, key: "email_not_verified" },
  { match: "We could not send the email right now. Please try again in a moment.", key: "email_send_failed" },
  { match: "Failed to create or retrieve user", key: "user_create_failed" },
  { match: "Failed to generate unique referral code. Please try again.", key: "referral_code_generation_failed" },
  { match: "Invalid referral code", key: "invalid_referral_code" },
  { match: "Cannot use your own referral code", key: "own_referral_code" },
  { match: /^Email is required\. Please ensure your social account/, key: "social_email_required" },
  { match: "Firebase token verification failed. Please try again.", key: "social_verification_failed" },
  { match: "No account is registered for this social profile. Please sign up first.", key: "social_account_missing" },
  { match: "Social login is not available. Please sign in with your email and password.", key: "social_login_unavailable" },
  { match: "This sign-in could not be verified. Please try again.", key: "sign_in_unverified" },
  { match: "This sign-in is no longer valid. Please sign in again.", key: "sign_in_invalid" },
  { match: "Your sign-in session has expired. Please try again.", key: "sign_in_expired" },
  { match: /^This sign-in method is not supported/, key: "sign_in_method_unsupported" },
  { match: /^Your social account email is not verified/, key: "social_email_unverified" },

  // Files
  { match: /^(?:File is required|No file provided)$/, key: "file_required" },
  { match: /^Invalid file type "(?<type>[^"]*)"\. Allowed types: (?<allowed>.+)$/, key: "invalid_file_type" },
  { match: "Invalid or missing file reference. Please re-upload the file.", key: "invalid_file_reference" },
  { match: "No document attached to this bill yet", key: "no_document_attached" },
  // Written by multer and Nest's parse pipes rather than by this codebase.
  { match: /^(?:File too large|Payload Too Large|request entity too large)$/i, key: "file_too_large" },
  { match: "Too many files", key: "too_many_files" },
  { match: "Unexpected field", key: "upload_unexpected_field" },
  { match: /^Validation failed \((?:uuid|numeric string) is expected\)$/, key: "invalid_identifier" },

  // Bills, cases & offers sent to customers
  { match: "userId is required", key: "user_id_required" },
  { match: "extractedData must be valid JSON", key: "extracted_data_invalid" },
  { match: "billType must be electricity or gas", key: "bill_type_invalid" },
  { match: /^No (?:valid )?offers found for the (?:given|provided) IDs$/, key: "offers_not_found" },
  { match: "No pending verification request found", key: "no_pending_verification" },
  { match: "No offers selected to send", key: "no_offers_selected" },
  { match: "Bill must be verified before sending offers.", key: "bill_must_be_verified" },
  { match: /^Bill is already in status "(?<status>.+)"$/, key: "bill_already_in_status", params: { status: "billStatus" } },
  { match: "Activation date and expiry date are required to put a case in activation", key: "activation_dates_required" },
  {
    match: /^Activation date and expiry date are required when moving the case to "(?<status>.+)"$/,
    key: "activation_dates_required_for_status",
    params: { status: "billStatus" },
  },
  { match: /^Message is required when moving the case to "(?<status>.+)"$/, key: "message_required_for_status", params: { status: "billStatus" } },
  { match: "Expiry date must be after the activation date", key: "expiry_after_activation" },
  { match: /^Cannot transition from (?<from>\S+) to (?<to>\S+)$/, key: "invalid_transition", params: { from: "value", to: "value" } },
  { match: "A switch request already exists for this bill", key: "switch_request_exists" },

  // Activation requests ("Attiva una nuova utenza")
  { match: "An activation request for this supply is already open", key: "activation_request_exists" },
  { match: "An active supply cannot be activated; request a transfer instead", key: "active_supply_not_activatable" },
  {
    match: /^An activation request cannot move from (?<from>\S+) to (?<to>\S+)$/,
    key: "activation_request_invalid_transition",
    params: { from: "activationStatus", to: "activationStatus" },
  },
  { match: "Assign an offer and the POD/PDR before putting the request in activation", key: "activation_request_needs_offer_and_pod" },
  { match: "Assign an offer before putting the request in activation", key: "activation_request_needs_offer" },
  { match: "Assign the POD/PDR before putting the request in activation", key: "activation_request_needs_pod" },
  { match: "The offer does not cover the supply type of this request", key: "offer_supply_mismatch" },
  { match: "energyType must be electricity or gas", key: "energy_type_invalid" },
  { match: "supplyActive is required when a meter is installed", key: "supply_active_required" },
  { match: "First name is required", key: "first_name_required" },
  { match: "Last name is required", key: "last_name_required" },
  { match: "Phone number is not valid", key: "phone_number_invalid" },
  { match: "Street is required", key: "street_required" },
  { match: "House number is required", key: "house_number_required" },
  { match: "Postal code must be 5 digits", key: "zip_invalid" },
  { match: "Province must be a 2-letter code", key: "province_code_invalid" },
  { match: "You must accept the privacy notice to be contacted", key: "privacy_required" },
  { match: "Cannot retrieve offers for a pending email bill. Upload the document first.", key: "pending_email_offers_retrieve" },
  { match: "Cannot send offers for a pending email bill. Upload the document first.", key: "pending_email_offers_send" },
  {
    match: /^Cannot send offers meant for a different audience to a (?<target>\S+) customer: (?<offers>.+)$/,
    key: "offers_wrong_audience",
    params: { target: "value" },
  },
  {
    match: /^Cannot send offers: the customer has already accepted an offer for this bill \(case (?<case>[^)]+)\)\. Cancel that case first\.$/,
    key: "offer_already_accepted",
  },
  { match: "All selected offers belong to suppliers that are pending deletion", key: "offers_supplier_pending_deletion" },
  { match: /^Cannot order offers that were never sent for this bill: (?<offers>.+)$/, key: "order_unsent_offers" },
  { match: "No offers have been sent for this bill yet, so there is no order to set.", key: "no_offers_sent_for_order" },
  { match: "The same offer was listed more than once in the order", key: "duplicate_offer_in_order" },
  { match: "This offer was not proposed for the selected bill", key: "offer_not_proposed" },
  { match: "Pending bill does not belong to the specified user", key: "pending_bill_other_user" },
  {
    match: /^You already have a pending email request for (?<billType>\S+)\. Please wait for it to be processed\.$/,
    key: "pending_email_request_exists",
    params: { billType: "value" },
  },
  { match: /^OCR extraction failed: (?<reason>.*)$/, key: "ocr_failed" },
  { match: "OCR extraction timed out. Please try again.", key: "ocr_timeout" },
  { match: "OCR service temporarily unavailable. Please try again.", key: "ocr_unavailable" },

  // Offer catalogue
  { match: "An offer with this offer code already exists", key: "offer_code_conflict" },
  {
    match: /^A fixed (?<energyType>\S+) offer requires a per-unit price: (?<missing>.+) (?:are|is) missing\.$/,
    key: "fixed_offer_price_required",
    params: { energyType: "value", missing: "list" },
  },
  {
    match: /^A (?<market>\S+) offer is priced as a spread over the market index, so a spread is required\.$/,
    key: "spread_required",
    params: { market: "value" },
  },
  { match: /^A numeric value exceeds the allowed range/, key: "numeric_out_of_range" },
  {
    match: /^Cannot delete this offer: it has (?<count>\d+) active case\(s\) in progress\. Cancel or complete them first\.$/,
    key: "offer_delete_active_cases",
  },
  {
    match: /^Cannot delete this offer: it has (?<count>\d+) live utility\/utilities \((?<cases>.*)\)\. Wait for them to expire or cancel them first\.$/,
    key: "offer_delete_live_utilities",
  },
  { match: /^This offer has been accepted by users and cannot be modified/, key: "offer_locked" },
  { match: "Cannot revert to draft: this offer is used by an active case", key: "offer_revert_draft_blocked" },
  { match: "Cannot publish offers for a supplier that is pending deletion", key: "publish_supplier_pending_deletion" },
  { match: "Cannot publish offers for an inactive supplier", key: "publish_supplier_inactive" },
  { match: "Cannot create a case for an offer from a supplier that is pending deletion", key: "case_supplier_pending_deletion" },
  { match: "Cannot move a case onto an offer from a supplier that is pending deletion", key: "case_move_supplier_pending_deletion" },
  {
    match: /^Commodity mismatch: a dual offer requires a dual supplier, but "(?<supplier>.+)" supports only "(?<commodity>.+)"$/,
    key: "commodity_mismatch_dual",
    params: { commodity: "value" },
  },
  {
    match: /^Commodity mismatch: supplier "(?<supplier>.+)" supports "(?<commodity>.+)" but the offer energy type is "(?<energyType>.+)"$/,
    key: "commodity_mismatch",
    params: { commodity: "value", energyType: "value" },
  },
  {
    match: /^Offer "(?<offer>.+)" only accepts (?<method>.+) as payment method$/,
    key: "offer_payment_method_only",
    params: { method: "value" },
  },
  { match: /^Direct debit requires (?<missing>.+)$/, key: "direct_debit_requires", params: { missing: "list" } },
  { match: "validUntil must be the same as or later than validFrom", key: "valid_until_before_from" },
  { match: "Referenced supplier does not exist", key: "referenced_supplier_missing" },

  // Suppliers
  { match: "A supplier with this supplier code already exists", key: "supplier_code_conflict" },
  { match: "Cannot modify a supplier pending deletion. Cancel the deletion first.", key: "supplier_pending_deletion_locked" },
  { match: "Supplier is not pending deletion", key: "supplier_not_pending_deletion" },
  {
    match: /^Cannot schedule deletion: the following live utilities have no expiry date set: (?<cases>.+)\. Please set expiry dates on them first\.$/,
    key: "supplier_deletion_missing_expiry",
  },
  { match: "A service type with this utility type already exists", key: "service_type_exists" },

  // Customers
  { match: "A customer with these details already exists", key: "customer_exists" },
  { match: "A personal account is identified by its Codice Fiscale and does not carry a Partita IVA", key: "personal_account_no_vat" },
  { match: /^Company details belong to a business account/, key: "company_details_business_only" },
  { match: "Company name and Partita IVA are both required to create the company profile", key: "company_name_and_vat_required" },
  { match: "This Partita IVA is already registered to another account", key: "vat_already_registered" },
  { match: "Assigned agent must be an existing admin user", key: "assigned_agent_must_be_admin" },

  // Support, templates, legal, referrals
  { match: "Cannot delete topic with existing support requests. Deactivate it instead.", key: "topic_has_requests" },
  { match: /^A notification template named '(?<name>.+)' already exists$/, key: "template_name_exists" },
  { match: /^Unknown variable\(s\): (?<variables>.+?)\. See GET /, key: "unknown_variables" },
  { match: /^Cannot resolve (?<variables>.+) for this recipient$/, key: "unresolved_variables" },
  {
    match: /^A page with slug '(?<slug>.+)' already exists for locale '(?<locale>.+)'$/,
    key: "page_slug_exists",
    params: { locale: "value" },
  },
  { match: /^Version cannot go backwards: '(?<version>.+)' is already published$/, key: "version_backwards" },
  { match: /^A newer version has been published, please reload: (?<pages>.+)$/, key: "stale_legal_version" },
  { match: /^Not a legal document for this account: (?<documents>.+)$/, key: "not_a_legal_document" },
  { match: "rewardAmount is required when setting status to REWARDED", key: "reward_amount_required" },

  // DTO validation messages written by the backend
  { match: "Brand name is required", key: "brand_name_required" },
  { match: "City is required", key: "city_required" },
  { match: "Commodity must be one of: electricity, gas, dual", key: "commodity_invalid" },
  { match: "Contact email is required", key: "contact_email_required" },
  { match: "Contact name is required", key: "contact_name_required" },
  { match: "Contact phone number is required", key: "contact_phone_required" },
  { match: "Current password is required", key: "current_password_required" },
  { match: "Enter a valid email address", key: "email_invalid" },
  { match: "Legal name is required", key: "legal_name_required" },
  { match: "New password is required", key: "new_password_required" },
  { match: /^(?:New p|P)assword must be at least 8 characters long$/, key: "password_min_length" },
  { match: /^(?:New p|P)assword must contain at least one lowercase letter$/, key: "password_lowercase" },
  { match: /^(?:New p|P)assword must contain at least one uppercase letter$/, key: "password_uppercase" },
  { match: /^(?:New p|P)assword must contain at least one number$/, key: "password_number" },
  { match: /^(?:New p|P)assword must contain at least one special character$/, key: "password_special" },
  { match: "Password confirmation is required", key: "password_confirmation_required" },
  { match: "Province is required", key: "province_required" },
  { match: "Role must be personal or business", key: "role_invalid" },
  { match: "Status must be one of: active, inactive", key: "status_invalid" },
  { match: "Street address is required", key: "street_required" },
  { match: "Tax ID is required", key: "tax_id_required" },
  { match: "ZIP code is required", key: "zip_required" },
  { match: /^(?:ZIP code must be a valid 5-digit Italian CAP|\w*PostalCode must be a 5-digit CAP)/, key: "zip_invalid" },
  { match: "code must be exactly 6 digits", key: "code_six_digits" },
  { match: "version must be a dotted number such as 2.1", key: "version_format" },
  { match: /^Tax ID must be a valid Italian Codice Fiscale/, key: "tax_id_invalid" },
  { match: /^Codice Fiscale is not valid/, key: "codice_fiscale_invalid" },
  { match: /^Partita IVA is not valid/, key: "partita_iva_invalid" },
  { match: /^Partita IVA is required for a business account/, key: "partita_iva_required_business" },
  { match: /^Phone number must be valid international format/, key: "phone_invalid" },

  // class-validator defaults ("<field> must be ..."), matched last
  { match: /^property (?<field>\S+) should not exist$/, key: "field_not_allowed" },
  { match: /^(?<field>\S+) should not be empty$/, key: "field_required" },
  { match: /^(?<field>\S+) must be an email$/, key: "field_email" },
  { match: /^(?<field>\S+) must be longer than or equal to (?<count>\d+) characters$/, key: "field_min_length" },
  { match: /^(?<field>\S+) must be shorter than or equal to (?<count>\d+) characters$/, key: "field_max_length" },
  { match: /^(?<field>\S+) must not be less than (?<count>-?[\d.]+)$/, key: "field_min" },
  { match: /^(?<field>\S+) must not be greater than (?<count>-?[\d.]+)$/, key: "field_max" },
  { match: /^(?<field>\S+) must be one of the following values: (?<values>.+)$/, key: "field_one_of" },
  { match: /^(?<field>\S+) (?:must|should) /, key: "field_invalid" },
];

/** Backend `errorCode`s that pin the message regardless of its wording. */
const errorCodes: Record<string, string> = {
  CANNOT_REGISTER_AS_ADMIN: "cannot_register_as_admin",
  EMAIL_ALREADY_REGISTERED: "email_already_registered",
  INVALID_CREDENTIALS: "invalid_credentials",
  INVALID_OR_EXPIRED_OTP: "invalid_or_expired_otp",
  INVALID_OR_EXPIRED_REFRESH_TOKEN: "invalid_or_expired_refresh_token",
  INVALID_OR_EXPIRED_RESET_TOKEN: "invalid_or_expired_reset_token",
  INVALID_OR_EXPIRED_VERIFICATION_TOKEN: "invalid_or_expired_verification_token",
  PHONE_OTP_NOT_RESENDABLE: "phone_otp_not_resendable",
  EMAIL_OR_TOKEN_REQUIRED: "email_or_token_required",
  USER_NOT_FOUND: "user_not_found",
  BILL_NOT_FOUND: "bill_not_found",
  BILL_ACCESS_DENIED: "bill_access_denied",
  OFFER_NOT_FOUND: "offer_not_found",
  OFFERS_NOT_FOUND: "offers_not_found",
  OFFER_CODE_CONFLICT: "offer_code_conflict",
  CASE_NOT_FOUND: "case_not_found",
  CASE_ACCESS_DENIED: "access_denied",
  DOCUMENT_NOT_FOUND: "document_not_found",
  TICKET_NOT_FOUND: "ticket_not_found",
  TICKET_ACCESS_DENIED: "access_denied",
  FAQ_NOT_FOUND: "faq_not_found",
  NOTIFICATION_NOT_FOUND: "notification_not_found",
  PUSH_TOKEN_NOT_FOUND: "push_token_not_found",
  SUPPLIER_NOT_FOUND: "supplier_not_found",
  METER_NOT_FOUND: "meter_not_found",
  AGREEMENT_NOT_FOUND: "agreement_not_found",
  REFERRAL_NOT_FOUND: "referral_not_found",
  INVALID_REFERRAL_CODE: "invalid_referral_code",
  NO_FILE_PROVIDED: "file_required",
};

/** English bill-status labels the backend puts in messages (BILL_STATUS_LABELS). */
const billStatusByLabel: Record<string, string> = {
  "Pending (Email)": "pending_email",
  Uploaded: "uploaded",
  Analyzing: "analyzing",
  Analyzed: "analyzed",
  Error: "error",
  "Verification Review": "verification_review",
  "Verification Required": "verification_required",
  Verified: "verified",
  "Offer Sent": "offer_sent",
  "Offer Accepted": "offer_accepted",
  "Contract Sent": "contract_sent",
  "In Activation": "awaiting_activation",
  Activated: "activated",
  Cancelled: "cancelled",
};

const translateValue = (value: string) =>
  i18n.t(`api_errors.values.${value.trim()}`, { defaultValue: value.trim() });

const translateParam = (value: string, kind: ParamKind | undefined) => {
  if (!kind) return value;
  if (kind === "activationStatus") {
    return i18n.t(`activation_requests.status.${value}`, { defaultValue: value });
  }
  if (kind === "billStatus") {
    const status = billStatusByLabel[value] ?? value;
    return i18n.t(`case_management.status.${status}`, { defaultValue: value });
  }
  if (kind === "list") {
    const parts = value.split(/\s+and\s+|,\s*/).map(translateValue);
    return parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} ${i18n.t("api_errors.and")} ${parts[parts.length - 1]}`
      : parts[0];
  }
  return translateValue(value);
};

/** Translation of one backend message, or null when it is not in the catalogue. */
export function translateApiMessage(raw: string): string | null {
  const message = raw.trim();
  for (const rule of rules) {
    if (typeof rule.match === "string") {
      if (rule.match === message) return i18n.t(`api_errors.${rule.key}`);
      continue;
    }
    const found = rule.match.exec(message);
    if (!found) continue;
    const params: Record<string, string> = {};
    for (const [name, value] of Object.entries(found.groups ?? {})) {
      params[name] = translateParam(value ?? "", rule.params?.[name]);
    }
    return i18n.t(`api_errors.${rule.key}`, params);
  }
  return null;
}

type ApiErrorLike = {
  status?: number | string;
  data?: { message?: string | string[]; errorCode?: string } | string;
  message?: string;
  error?: string;
};

const statusFallback = (status: number | string | undefined): string => {
  if (status === "FETCH_ERROR" || status === "TIMEOUT_ERROR") return i18n.t("api_errors.network");
  if (status === 401) return i18n.t("api_errors.unauthorized");
  if (status === 403) return i18n.t("api_errors.forbidden");
  if (status === 404) return i18n.t("api_errors.not_found");
  if (status === 429) return i18n.t("api_errors.too_many_requests");
  if (status === 413) return i18n.t("api_errors.file_too_large");
  if (typeof status === "number" && status >= 500) return i18n.t("api_errors.server");
  if (status === "PARSING_ERROR") return i18n.t("api_errors.server");
  return i18n.t("api_errors.generic");
};

/**
 * Message to show for a failed request, in the active language.
 *
 * @param fallback what to say when the backend's message is not in the
 *   catalogue — usually the action that failed ("Impossibile salvare…").
 */
export function getApiErrorMessage(error: unknown, fallback?: string): string {
  const err = (error ?? {}) as ApiErrorLike;
  const data = typeof err.data === "object" && err.data !== null ? err.data : undefined;

  const codeKey = data?.errorCode ? errorCodes[data.errorCode] : undefined;
  if (codeKey) return i18n.t(`api_errors.${codeKey}`);

  if (err.status === "FETCH_ERROR" || err.status === "TIMEOUT_ERROR") return statusFallback(err.status);

  const rawMessages = data?.message ?? (typeof err.data === "string" ? err.data : undefined) ?? err.message;
  const messages = (Array.isArray(rawMessages) ? rawMessages : [rawMessages])
    .filter((m): m is string => typeof m === "string" && m.trim().length > 0);

  if (messages.length === 0) return fallback ?? statusFallback(err.status);

  const translated = messages.map((m) => translateApiMessage(m));
  if (translated.every((m): m is string => m !== null)) return [...new Set(translated)].join(" ");

  // Untranslated text is only ever shown raw to an admin who chose English.
  if (currentLanguage() === "en") {
    return [...new Set(messages.map((m, i) => translated[i] ?? m))].join(" ");
  }
  if (import.meta.env.DEV) console.warn("[api_errors] untranslated backend message:", messages);
  const known = translated.filter((m): m is string => m !== null);
  if (known.length > 0) return [...new Set(known)].join(" ");
  return fallback ?? statusFallback(err.status);
}
