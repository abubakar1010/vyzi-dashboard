import { baseApi } from "../../api/baseApi";

export interface ICaseUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  codiceFiscale?: string | null;
  /** Which of the two account kinds this is — a VAT number only applies to one. */
  role?: "personal" | "business" | "admin";
  /**
   * A company is identified by its name and VAT number, which live on its
   * profile — alongside the certified address its invoices are delivered to.
   */
  businessProfile?: {
    companyName?: string | null;
    partitaIva?: string | null;
    pecEmail?: string | null;
  } | null;
}

/** The bill the case was opened from, as returned by `GET /cases/:id`. */
export interface ICaseBill {
  id: string;
  billType: string;
  totalAmount: number | null;
  podNumber?: string | null;
  pdrNumber?: string | null;
  /** Supplier name as read off the bill by OCR — no supplier record required. */
  supplierName?: string | null;
  supplyAddress?: string | null;
  customerName?: string | null;
  codiceFiscale?: string | null;
  partitaIva?: string | null;
  contractNumber?: string | null;
  meterNumber?: string | null;
}

/**
 * The offer the customer accepted, as `GET /cases/:id` returns it — the whole
 * offer row, not just its name. What the case detail view quotes the signed
 * terms from: an offer's price, fee and duration belong to the offer, and
 * copying them onto the case would only let the two drift apart.
 */
export interface ICaseOffer {
  id: string;
  name: string;
  /** The supplier's own reference for this tariff, printed on the contract. */
  offerCode?: string | null;
  marketType?: "fixed" | "variable" | "indexed";
  energyType?: "electricity" | "gas" | "dual";
  pricePerKwh?: number | null;
  pricePerSmc?: number | null;
  /** What a variable or indexed offer quotes instead of a price of its own. */
  spread?: number | null;
  fixedMonthlyFee?: number | null;
  contractDurationMonths?: number | null;
  contractDurationDays?: number | null;
  isGreenEnergy?: boolean;
  supplier?: { id: string; name: string };
}

export interface ICaseDocument {
  id: string;
  caseId: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  uploadedById: string;
  verified: boolean;
  verifiedById: string | null;
  verifiedAt: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  /** Set when an admin turned the document down and asked for a new one. */
  rejectedAt: string | null;
  rejectedById: string | null;
  rejectionReason: DocumentRejectionReason | null;
  rejectionNote: string | null;
  /** The rejected document this one was uploaded to replace. */
  replacesDocumentId: string | null;
  createdAt: string;
  uploadedBy?: ICaseUser;
  rejectedBy?: ICaseUser;
}

export type DocumentRejectionReason =
  | "expired"
  | "unreadable"
  | "incomplete"
  | "wrong_document"
  | "other";

export interface ICaseEvent {
  id: string;
  caseId: string;
  eventType: string;
  title: string;
  description: string | null;
  oldStatus: string | null;
  newStatus: string | null;
  actorId: string | null;
  actorLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: ICaseUser | null;
}

export interface ICase {
  id: string;
  userId: string;
  /** Null on an activation request: a supply that is not running has no bill. */
  billId: string | null;
  /** Null on an activation request until the operator assigns an offer. */
  selectedOfferId: string | null;
  assignedAgentId: string | null;
  status: string;
  priority: string;
  notes: string | null;
  internalNotes: string | null;
  caseNumber: string | null;
  caseType: string;
  slaDeadline: string | null;
  slaDaysTotal: number | null;
  estimatedAnnualValue: number | null;
  fromSupplierId: string | null;
  toSupplierId: string | null;
  meterId: string | null;

  // ── Activation request ──
  // "Attiva una nuova utenza": no bill, so the supply type and delivery point
  // are held on the case, with the person to call back.
  /** `electricity` or `gas`. Set on activation requests only. */
  energyType?: "electricity" | "gas" | null;
  /** POD (electricity) or PDR (gas), entered by the operator after the call. */
  podPdrNumber?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactPhone?: string | null;
  /** When the customer acknowledged the privacy notice and asked to be called. */
  privacyConsentAt?: string | null;

  // ── Addresses ──
  // Supply, residential and shipping all carry the same five fields, so every
  // address reads the same way.

  /** Where the energy is delivered — taken from the bill, confirmed by the user. */
  supplyStreet: string | null;
  supplyStreetNumber: string | null;
  supplyCity: string | null;
  supplyPostalCode: string | null;
  supplyProvince: string | null;

  residentialSameAsSupply: boolean;
  residentialStreet: string | null;
  residentialStreetNumber: string | null;
  residentialCity: string | null;
  residentialPostalCode: string | null;
  residentialProvince: string | null;

  /** Only meaningful when `invoiceDelivery` is `paper`. */
  shippingSameAsSupply: boolean;
  shippingStreet: string | null;
  shippingStreetNumber: string | null;
  shippingCity: string | null;
  shippingPostalCode: string | null;
  shippingProvince: string | null;

  // ── Payment & invoicing ──
  paymentMethod: string | null;
  invoiceDelivery: string | null;
  /** Where digital invoices go — defaults to the account email. */
  invoiceEmail: string | null;
  iban: string | null;
  /**
   * Whether the account the direct debit is taken from belongs to the contract
   * holder. Null on cases filed before the app started asking — which is not
   * the same answer as `false`, so the detail view says so rather than guessing.
   */
  ibanSameAsContract: boolean | null;
  ibanHolderFirstName: string | null;
  ibanHolderLastName: string | null;
  /** Codice Fiscale or Partita IVA — the mandate is filed against it. */
  ibanHolderTaxCode: string | null;

  // ── Activation ──
  // Contract signing happens outside the app; the admin enters both dates when
  // moving the case to "In Activation".
  /** When the admin handed the contract over for signing. */
  contractSentAt?: string | null;
  /** When the new supply goes live. */
  activationDate?: string | null;
  /** When the new supply contract expires. */
  expiryDate?: string | null;

  createdAt: string;
  updatedAt: string;
  user?: ICaseUser;
  assignedAgent?: ICaseUser | null;
  selectedOffer?: ICaseOffer | null;
  bill?: ICaseBill | null;
  fromSupplier?: { id: string; name: string } | null;
  toSupplier?: { id: string; name: string } | null;
  documents?: ICaseDocument[];
  /** Yearly saving quoted on the offer the customer accepted. */
  estimatedSavings?: number | null;
  events?: ICaseEvent[];
}

export interface ICaseQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  priority?: string;
  assignedAgentId?: string;
  userId?: string;
  /** One or more case types; `new_activation,takeover` are the activation requests. */
  caseType?: string[];
  energyType?: string;
}

/**
 * The five fields one address block is stored as, under its prefix. Supply,
 * residence and shipping all read the same way.
 */
type ICaseAddressFields<P extends string> = {
  [K in `${P}${"Street" | "StreetNumber" | "City" | "PostalCode" | "Province"}`]?: string | null;
};

/**
 * Every field of a case an admin can correct. All optional — only what changed
 * is sent — and `null` clears a field the case is allowed to hold nothing in.
 */
export interface IUpdateCase
  extends ICaseAddressFields<"supply">,
    ICaseAddressFields<"residential">,
    ICaseAddressFields<"shipping"> {
  status?: string;
  caseType?: string;
  priority?: string;
  notes?: string | null;
  internalNotes?: string | null;
  /** The admin handling the case. `null` puts it back in the unassigned queue. */
  assignedAgentId?: string | null;
  /** Moves the destination supplier with it, server-side. */
  selectedOfferId?: string;
  /** `YYYY-MM-DD`. Correcting the dates an admin entered at activation. */
  activationDate?: string | null;
  expiryDate?: string | null;
  /** ISO instant. Stamped when the bill first reaches "contract sent". */
  contractSentAt?: string | null;

  // ── Activation request ──
  energyType?: "electricity" | "gas" | null;
  /** Stored without spaces and upper-cased by the server. */
  podPdrNumber?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactPhone?: string | null;

  // ── Commercial & SLA ──
  /** What the switch is worth over a year, in euro. */
  estimatedAnnualValue?: number | null;
  /** Days the case is allowed to take end to end. */
  slaDaysTotal?: number | null;
  /** ISO instant the case falls out of SLA. */
  slaDeadline?: string | null;
  /**
   * While true, the matching block is kept as a copy of the supply address by
   * the server — correcting the supply address moves it too.
   */
  residentialSameAsSupply?: boolean;
  shippingSameAsSupply?: boolean;

  // ── Payment & invoicing ──
  /** Must stay one the selected offer accepts, or the server refuses the edit. */
  paymentMethod?: string | null;
  invoiceDelivery?: string | null;
  invoiceEmail?: string | null;
  /** Stored without spaces and upper-cased by the server. */
  iban?: string | null;
  ibanSameAsContract?: boolean | null;
  ibanHolderFirstName?: string | null;
  ibanHolderLastName?: string | null;
  /**
   * Stored without spaces and upper-cased, and checked against its own check
   * character — the server refuses one that is merely the right shape.
   */
  ibanHolderTaxCode?: string | null;
}

interface IPaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const caseApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCases: builder.query<IPaginatedResponse<ICase>, ICaseQuery | void>({
      query: (params) => {
        const qp = new URLSearchParams();
        if (params) {
          if (params.page) qp.set("page", String(params.page));
          if (params.limit) qp.set("limit", String(params.limit));
          if (params.search) qp.set("search", params.search);
          if (params.status) qp.set("status", params.status);
          if (params.priority) qp.set("priority", params.priority);
          if (params.assignedAgentId) qp.set("assignedAgentId", params.assignedAgentId);
          if (params.userId) qp.set("userId", params.userId);
          if (params.caseType?.length) qp.set("caseType", params.caseType.join(","));
          if (params.energyType) qp.set("energyType", params.energyType);
        }
        return { url: `cases?${qp.toString()}`, method: "GET" };
      },
      transformResponse: (response: { success: boolean; data: IPaginatedResponse<ICase> }) =>
        response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: "case" as const, id })),
              { type: "case" as const, id: "LIST" },
            ]
          : [{ type: "case" as const, id: "LIST" }],
    }),

    getCaseById: builder.query<ICase, string>({
      query: (id) => ({ url: `cases/${id}`, method: "GET" }),
      transformResponse: (response: { success: boolean; data: ICase }) => response.data,
      providesTags: (_r, _e, id) => [{ type: "case" as const, id }],
    }),

    updateCase: builder.mutation<ICase, { id: string; data: IUpdateCase }>({
      query: ({ id, data }) => ({ url: `cases/${id}`, method: "PATCH", body: data }),
      transformResponse: (response: { success: boolean; data: ICase }) => response.data,
      invalidatesTags: (result, _e, { id }) => [
        { type: "case", id },
        { type: "case", id: "LIST" },
        ...(result?.billId
          ? [{ type: "bill" as const, id: result.billId }]
          : []),
        { type: "bill" as const, id: "LIST" },
        { type: "dashboard", id: "ADMIN" },
        { type: "activityLog", id: "LIST" },
      ],
    }),

    getCaseDocuments: builder.query<ICaseDocument[], string>({
      query: (caseId) => ({ url: `cases/${caseId}/documents`, method: "GET" }),
      transformResponse: (response: { success: boolean; data: ICaseDocument[] }) => response.data,
    }),

    uploadCaseDocument: builder.mutation<
      ICaseDocument,
      { caseId: string; documentType: string; fileUrl: string; fileName: string }
    >({
      query: ({ caseId, ...body }) => ({
        url: `cases/${caseId}/documents`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { caseId }) => [{ type: "case", id: caseId }],
    }),

    verifyDocument: builder.mutation<ICaseDocument, { caseId: string; docId: string }>({
      query: ({ caseId, docId }) => ({
        url: `cases/${caseId}/documents/${docId}/verify`,
        method: "PATCH",
      }),
      invalidatesTags: (_r, _e, { caseId }) => [
        { type: "case", id: caseId },
        { type: "dashboard", id: "ADMIN" },
        { type: "activityLog", id: "LIST" },
      ],
    }),

    rejectDocument: builder.mutation<
      ICaseDocument,
      { caseId: string; docId: string; reason: DocumentRejectionReason; note?: string }
    >({
      query: ({ caseId, docId, ...body }) => ({
        url: `cases/${caseId}/documents/${docId}/reject`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, { caseId }) => [
        { type: "case", id: caseId },
        { type: "dashboard", id: "ADMIN" },
        { type: "activityLog", id: "LIST" },
      ],
    }),

  }),
});

export const {
  useGetCasesQuery,
  useGetCaseByIdQuery,
  useUpdateCaseMutation,
  useGetCaseDocumentsQuery,
  useUploadCaseDocumentMutation,
  useVerifyDocumentMutation,
  useRejectDocumentMutation,
} = caseApi;
