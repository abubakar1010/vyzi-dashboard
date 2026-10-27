import { getApiErrorMessage } from "../../utils/apiError";
import { getLocale } from "../../utils/format";
import { useState, useCallback, useContext, useMemo, useRef, createContext } from "react";
import { App, Button, Input, InputNumber, Spin, Empty, Tag, Select, Table, Upload, Tooltip, DatePicker, Modal, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { ColumnsType } from "antd/es/table";
import type { SortOrder } from "antd/es/table/interface";
import {
  FiArrowLeft,
  FiCheck,
  FiCheckCircle,
  FiEdit2,
  FiEye,
  FiFileText,
  FiSend,
  FiX,
} from "react-icons/fi";
import {
  LuZap,
  LuFlame,
  LuLeaf,
  LuHouse,
  LuMail,
  LuBuilding2,
  LuRotateCcw,
  LuGripVertical,
  LuStar,
  LuPackageSearch,
  LuUpload,
  LuMessageSquare,
  LuClock3,
  LuDownload,
} from "react-icons/lu";
import { FiDownload } from "react-icons/fi";
import { useNavigate, useParams } from "react-router";
import {
  useGetBillByIdAdminQuery,
  useGetAllOffersForBillQuery,
  useSendSelectedOffersMutation,
  useReorderBillOffersMutation,
  applyOfferOrderLocally,
  useTransitionBillStatusMutation,
  useGetBillNotesQuery,
  useAddBillNoteMutation,
  useUpdateBillNoteMutation,
  useDeleteBillNoteMutation,
  type IOfferWithSavings,
  type IBill,
  type IBillFile,
} from "../../redux/features/Bills/billApi";
import { PAYMENT_METHOD_LABELS } from "../../redux/features/Offers/offerApi";
import {
  useGetCaseByIdQuery,
  useUpdateCaseMutation,
  useVerifyDocumentMutation,
  useRejectDocumentMutation,
  useUploadCaseDocumentMutation,
  type DocumentRejectionReason,
  type ICase,
  type ICaseDocument,
} from "../../redux/features/Cases/caseApi";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { cn } from "../../utils/cn";
import { formatMoney, formatQuantity, formatUnitPrice } from "../../utils/format";
import { formatContractDuration } from "../../utils/contractDuration";
import { server_url, server_origin } from "../../config";
import EditBillModal from "./EditBillModal";
import EditCaseModal from "./EditCaseModal";
import CaseTimeline from "./CaseTimeline";
import VerificationFileList from "./VerificationFileList";
import i18n from "../../i18n";
import { useTranslation } from "react-i18next";

/* ── Status & Step Configuration ─────────────────────────── */

/**
 * Pipeline order, mirroring `PIPELINE_STATUS_ORDER` on the server. Used only to
 * work out whether a chosen status is ahead of or behind the current one —
 * the admin is free to pick any of them, in any order.
 */
const pipelineStatusOrder = [
  "uploaded", "analyzing", "analyzed",
  "verification_review", "verification_required", "verified",
  "offer_sent", "offer_accepted",
  "contract_sent",
  "awaiting_activation", "activated",
];

const stepConfig = [
  { label: "case_management.steps.upload_analysis", statuses: ["pending_email", "uploaded", "analyzing", "analyzed"] },
  { label: "case_management.steps.verification", statuses: ["verification_review", "verification_required", "verified"] },
  { label: "case_management.steps.offers", statuses: ["offer_sent", "offer_accepted"] },
  { label: "case_management.steps.contract", statuses: ["contract_sent"] },
  { label: "case_management.steps.in_activation", statuses: ["awaiting_activation"] },
  { label: "case_management.steps.activated", statuses: ["activated"] },
];

const localizedStatus = (status: string) =>
  i18n.t(`case_management.status.${status}`, { defaultValue: status });

const localizedUi = (key: string, fallback: string, options?: Record<string, unknown>) =>
  i18n.t(`case_management.ui.${key}`, { defaultValue: fallback, ...options });

const localizedDetail = (key: string, fallback: string, options?: Record<string, unknown>) =>
  i18n.t(`case_management.detail.${key}`, { defaultValue: fallback, ...options });

const statusTagColor: Record<string, string> = {
  pending_email: "purple",
  uploaded: "blue",
  analyzing: "orange",
  analyzed: "green",
  error: "red",
  verification_review: "gold",
  verification_required: "volcano",
  verified: "green",
  offer_sent: "cyan",
  offer_accepted: "purple",
  contract_sent: "gold",
  awaiting_activation: "processing",
  activated: "green",
  cancelled: "default",
};

/* ── Status dropdown configuration ───────────────────────── */

/**
 * Every status the administrator can set, grouped by pipeline stage.
 * Selection is not restricted to the step order — any entry can be picked at
 * any time, which moves the case forward or backward.
 */
const statusGroups: { label: string; statuses: string[] }[] = [
  { label: "case_management.steps.upload_analysis", statuses: ["uploaded", "analyzing", "analyzed"] },
  { label: "case_management.steps.verification", statuses: ["verification_review", "verification_required", "verified"] },
  { label: "case_management.steps.offers", statuses: ["offer_sent", "offer_accepted"] },
  { label: "case_management.steps.contract", statuses: ["contract_sent"] },
  { label: "case_management.steps.activation", statuses: ["awaiting_activation", "activated"] },
  { label: "case_management.steps.other", statuses: ["cancelled"] },
];

/**
 * System-managed states. They are never offered as a destination, but they are
 * listed when the case is currently sitting in one so it can be moved out.
 */
const systemOnlyStatuses = ["pending_email", "error"];

/** Statuses that carry a message to the customer and open the request modal. */
const statusesRequiringMessage = ["verification_required"];

/**
 * Statuses that cannot be set without the activation and expiry dates, and so
 * open the dates modal instead of transitioning straight away. The server
 * enforces the same rule.
 */
const statusesRequiringDates = ["awaiting_activation"];

const statusDotClass: Record<string, string> = {
  pending_email: "bg-purple-400",
  uploaded: "bg-blue-400",
  analyzing: "bg-orange-400",
  analyzed: "bg-emerald-400",
  error: "bg-red-500",
  verification_review: "bg-amber-400",
  verification_required: "bg-red-400",
  verified: "bg-emerald-500",
  offer_sent: "bg-cyan-400",
  offer_accepted: "bg-purple-400",
  contract_sent: "bg-amber-500",
  awaiting_activation: "bg-blue-500",
  activated: "bg-emerald-600",
  cancelled: "bg-slate-400",
};

/* ── Helpers ──────────────────────────────────────────────── */

function getStatusDirection(from: string, to: string): "forward" | "backward" | "lateral" {
  const fromIdx = pipelineStatusOrder.indexOf(from);
  const toIdx = pipelineStatusOrder.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return "lateral";
  return toIdx > fromIdx ? "forward" : "backward";
}

function getStepIndex(billStatus: string): number {
  for (let i = 0; i < stepConfig.length; i++) {
    if (stepConfig[i].statuses.includes(billStatus)) return i;
  }
  return -1;
}

function getStepStates(billStatus: string): ("done" | "current" | "pending")[] {
  const currentStep = getStepIndex(billStatus);
  if (currentStep < 0) return stepConfig.map(() => "pending");
  return stepConfig.map((_, i) => {
    if (i < currentStep) return "done";
    if (i === currentStep) return "current";
    return "pending";
  });
}

const fmtDate = (val: string | null | undefined) => {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString(getLocale(), {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return val;
  }
};

/** Italian date format — what the admins and the customers both read. */
const fmtDateIt = (val: string | null | undefined) => {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString(getLocale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return val;
  }
};

/* Both yield null rather than a dash for a missing figure, so the detail rows
   that render `value` drop out entirely instead of showing an empty amount. */
const fmt = (val: number | null | undefined): string | null =>
  formatMoney(val, { fallback: null });

const fmtNum = (val: number | null | undefined, unit = ""): string | null =>
  formatQuantity(val, unit, { fallback: null });

/* ── Case Status Dropdown ────────────────────────────────── */

/**
 * Replaces the old "Advance Status" button: every status is selectable, in any
 * order, so a case can be moved forward or backward. The current status is
 * shown in the closed control and flagged in the list.
 */
function CaseStatusSelect({
  currentStatus,
  onSelect,
  loading = false,
  size = "middle",
  className = "",
}: {
  currentStatus: string;
  onSelect: (status: string) => void;
  loading?: boolean;
  size?: "small" | "middle";
  className?: string;
}) {
  const buildOption = (status: string) => ({
    value: status,
    label: localizedStatus(status),
    // The case is already here — nothing to change.
    disabled: status === currentStatus,
  });

  const options = [
    // A system-managed status is only listed while the case is parked in it.
    ...(systemOnlyStatuses.includes(currentStatus)
      ? [{ label: i18n.t("case_management.current"), options: [buildOption(currentStatus)] }]
      : []),
    ...statusGroups.map((group) => ({
      label: i18n.t(group.label),
      options: group.statuses.map(buildOption),
    })),
  ];

  return (
    <Select
      value={currentStatus}
      onChange={(value) => onSelect(value as string)}
      loading={loading}
      disabled={loading}
      size={size}
      listHeight={420}
      popupMatchSelectWidth={300}
      className={`min-w-[230px] ${className}`}
      options={options}
      labelRender={() => (
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass[currentStatus] || "bg-slate-300"}`}
          />
          <span className="font-semibold text-slate-700">
            {localizedStatus(currentStatus)}
          </span>
        </span>
      )}
      optionRender={(option) => {
        const status = String(option.value);
        const isCurrent = status === currentStatus;
        const direction = getStatusDirection(currentStatus, status);
        return (
          <div className="flex items-center justify-between gap-3">
            <span
              className={`flex min-w-0 items-center gap-2 ${
                isCurrent ? "font-semibold text-slate-800" : "text-slate-600"
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass[status] || "bg-slate-300"}`}
              />
              <span className="truncate">{localizedStatus(status)}</span>
            </span>
            {isCurrent ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#7061ED] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                <FiCheck className="h-2.5 w-2.5" />
                {i18n.t("case_management.current")}
              </span>
            ) : direction === "backward" ? (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                {i18n.t("case_management.back")}
              </span>
            ) : null}
          </div>
        );
      }}
    />
  );
}

/* ── Contextual admin actions ────────────────────────────── */

/** The statuses that have something for the admin to do right now. */
const statusesWithActions = [
  "verification_review",
  "verified",
  "offer_accepted",
  "contract_sent",
  "awaiting_activation",
];

interface CaseActionsPanelProps {
  billStatus: string;
  isTransitioning: boolean;
  onTransition: (targetStatus: string) => void;
  onRequestCorrections: () => void;
  onMoveToActivation: () => void;
  onGoToOffers: () => void;
}

/**
 * The next step, offered as a button. Rendered on both the Overview and the
 * Bill Data tab — it lives here rather than inline so the two can never drift.
 */
function CaseActionsPanel({
  billStatus,
  isTransitioning,
  onTransition,
  onRequestCorrections,
  onMoveToActivation,
  onGoToOffers,
}: CaseActionsPanelProps) {
  if (!statusesWithActions.includes(billStatus)) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-4">{i18n.t("common.actions")}</h3>
      <div className="flex flex-wrap gap-3">
        {billStatus === "verification_review" && (
          <>
            <Button
              type="primary"
              icon={<FiCheck />}
              loading={isTransitioning}
              onClick={() => onTransition("verified")}
              className="bg-emerald-500 hover:bg-emerald-600 border-0"
            >
              {localizedUi("approve_verified", "Approve — Mark Verified")}
            </Button>
            <Button danger icon={<FiSend />} onClick={onRequestCorrections}>
              {localizedUi("request_corrections", "Request Corrections")}
            </Button>
          </>
        )}
        {billStatus === "verified" && (
          <Button type="primary" icon={<FiSend />} onClick={onGoToOffers}>
            {localizedUi("send_offers", "Send Offers")}
          </Button>
        )}
        {billStatus === "offer_accepted" && (
          <Button
            type="primary"
            icon={<FiSend />}
            loading={isTransitioning}
            onClick={() => onTransition("contract_sent")}
          >
            {localizedUi("send_contract", "Send Contract to Customer")}
          </Button>
        )}
        {billStatus === "contract_sent" && (
          <Button
            type="primary"
            icon={<FiCheckCircle />}
            loading={isTransitioning}
            onClick={onMoveToActivation}
          >
            {localizedUi("move_to_activation", "Move to In Activation")}
          </Button>
        )}
        {billStatus === "awaiting_activation" && (
          <Button
            type="primary"
            icon={<FiCheckCircle />}
            loading={isTransitioning}
            onClick={() => onTransition("activated")}
            className="bg-emerald-500 hover:bg-emerald-600 border-0"
          >
            {localizedUi("activate_utility", "Activate Utility")}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Tab definitions ─────────────────────────────────────── */

const tabKeys = [
  { key: "overview", label: "overview" },
  { key: "available_offers", label: "offers" },
  { key: "bill_data", label: "bill_data" },
  { key: "verification", label: "verification" },
  { key: "notes", label: "notes" },
  { key: "case_details", label: "case_details" },
] as const;

/* ── Main Component ──────────────────────────────────────── */

const BillRequestDetailView = () => {
  useTranslation();
  const { message, notification } = App.useApp();
  const navigate = useNavigate();
  const { billId } = useParams();
  const {
    data: bill,
    isLoading,
    refetch,
  } = useGetBillByIdAdminQuery(billId!, { skip: !billId, refetchOnMountOrArgChange: true });
  const { data: allOffers, isLoading: offersLoading } = useGetAllOffersForBillQuery(billId!, {
    skip: !billId || bill?.status === "pending_email",
  });
  const [sendSelectedOffers, { isLoading: isSending }] = useSendSelectedOffersMutation();
  const [reorderBillOffers] = useReorderBillOffersMutation();
  const [transitionBillStatus] = useTransitionBillStatusMutation();
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [savingsOverrides, setSavingsOverrides] = useState<Record<string, number>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationEditOpen, setVerificationEditOpen] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationDate, setActivationDate] = useState<Dayjs | null>(null);
  const [expiryDate, setExpiryDate] = useState<Dayjs | null>(null);
  const offerOrderSave = useRef<Promise<unknown>>(Promise.resolve());

  /**
   * Saves the order the customer sees the offers in.
   *
   * The list on screen moves first and is saved after, so a dropped row stays
   * where it was let go instead of springing back for the length of the round
   * trip. The saves are chained rather than fired off in parallel: each one
   * carries the whole run, so two overlapping requests could land the wrong way
   * round and leave the server holding an order the admin only passed through
   * on the way to the one they wanted.
   */
  const handleReorderOffers = useCallback(
    (offerIds: string[]) => {
      if (!billId) return;
      dispatch(applyOfferOrderLocally(billId, offerIds));
      offerOrderSave.current = offerOrderSave.current
        .catch(() => undefined)
        .then(() => reorderBillOffers({ billId, offerIds }).unwrap())
        .catch((err: unknown) => {
          notification.error({
            message: i18n.t("audit.could_not_save_the_offer_order"),
            description: getApiErrorMessage(err, i18n.t("audit.offer_order_reloaded")),
            duration: 6,
          });
        });
    },
    [billId, dispatch, reorderBillOffers, notification],
  );

  /**
   * Keeps the tick order meaningful.
   *
   * `selectedRowKeys` is not just a set here — its order is the order the batch
   * will be sent in, and so the order the customer will first see. Ant Design
   * hands back the selection in table order on every change, which would undo
   * any arranging the admin had done, so the offers still ticked keep the
   * places they were given and only the new ones join the end.
   */
  const handleSelectionChange = useCallback((keys: React.Key[]) => {
    setSelectedRowKeys((previous) => {
      const stillTicked = new Set(keys.map(String));
      const kept = previous.filter((key) => stillTicked.has(String(key)));
      const keptKeys = new Set(kept.map(String));
      return [...kept, ...keys.filter((key) => !keptKeys.has(String(key)))];
    });
  }, []);

  const handleTransition = async (
    targetStatus: string,
    dates?: { activationDate: string; expiryDate: string },
  ) => {
    if (!bill) return;
    const previousStatus = bill.status;
    setIsTransitioning(true);
    try {
      await transitionBillStatus({ billId: bill.id, targetStatus, ...dates }).unwrap();
      const movedBack = getStatusDirection(previousStatus, targetStatus) === "backward";
      message.success(
        i18n.t(movedBack ? "audit.status_moved_back_notified" : "audit.status_updated_notified", {
          status: localizedStatus(targetStatus),
        }),
      );
      refetch();
    } catch (err: any) {
      message.error(getApiErrorMessage(err, i18n.t("audit.status_update_failed")));
    } finally {
      setIsTransitioning(false);
    }
  };

  /**
   * Applies a status chosen from the dropdown. Any status can be picked, in any
   * order — except the two that cannot be applied on their own: a verification
   * request needs a message for the customer, and In Activation needs the dates
   * the supplier gave us. Both open a modal instead.
   */
  const handleStatusSelect = (targetStatus: string) => {
    if (!bill || targetStatus === bill.status) return;

    if (statusesRequiringMessage.includes(targetStatus)) {
      setShowVerificationModal(true);
      return;
    }

    if (statusesRequiringDates.includes(targetStatus)) {
      openActivationModal();
      return;
    }

    handleTransition(targetStatus);
  };

  /** Pre-fills with whatever the case already carries, so a re-run is an edit. */
  const openActivationModal = () => {
    setActivationDate(activeCase?.activationDate ? dayjs(activeCase.activationDate) : null);
    setExpiryDate(activeCase?.expiryDate ? dayjs(activeCase.expiryDate) : null);
    setShowActivationModal(true);
  };

  const handleMoveToActivation = async () => {
    if (!activationDate || !expiryDate) return;
    await handleTransition("awaiting_activation", {
      activationDate: activationDate.format("YYYY-MM-DD"),
      expiryDate: expiryDate.format("YYYY-MM-DD"),
    });
    setShowActivationModal(false);
  };

  const handleSendVerificationRequest = async () => {
    if (!bill) return;
    if (!verificationMessage.trim()) {
      message.warning(i18n.t("notification_templates.body_required"));
      return;
    }
    setIsTransitioning(true);
    try {
      await transitionBillStatus({
        billId: bill.id,
        targetStatus: "verification_required",
        message: verificationMessage,
      }).unwrap();
      message.success(i18n.t("audit.verification_request_sent"));
      setShowVerificationModal(false);
      setVerificationMessage("");
      refetch();
    } catch (err: any) {
      message.error(getApiErrorMessage(err, i18n.t("audit.request_send_failed")));
    } finally {
      setIsTransitioning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spin size="large" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <Empty description={i18n.t("audit.bill_request_not_found")} />
        <Button onClick={() => navigate("/case-management")} icon={<FiArrowLeft />}>
          {i18n.t("audit.back_to_case_management")}
        </Button>
      </div>
    );
  }

  const isElectricity = bill.billType === "electricity";
  const activeCase = bill.switchCases?.length
    ? [...bill.switchCases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const stepStates = getStepStates(bill.status);
  const currentStepIdx = stepStates.indexOf("current");
  const doneCount = stepStates.filter((s) => s === "done").length;
  const progressPct =
    currentStepIdx >= 0
      ? (currentStepIdx / (stepConfig.length - 1)) * 100
      : doneCount === stepConfig.length
        ? 100
        : 0;

  const customerName = bill.user
    ? `${bill.user.firstName} ${bill.user.lastName}`
    : "—";

  const handleSendOffers = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(i18n.t("audit.please_select_at_least_one_offer"));
      return;
    }

    // `selectedRowKeys` is held in the order the admin arranged, so the batch
    // goes out in it — that is the order the customer first sees, and it is
    // settled here rather than after the fact.
    const offersPayload = selectedRowKeys.map((key) => {
      const id = String(key);
      const override = savingsOverrides[id];
      return override != null
        ? { offerId: id, estimatedSavings: override }
        : { offerId: id };
    });

    const result = await sendSelectedOffers({ billId: bill.id, offers: offersPayload });

    if ("error" in result) {
      notification.error({
        message: i18n.t("audit.cannot_send_offers"),
        description: getApiErrorMessage(result.error),
        duration: 6,
      });
    } else {
      message.success(i18n.t("audit.offers_sent_to_user", { count: selectedRowKeys.length }));
      setSelectedRowKeys([]);
      refetch();
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            {/* Current Status */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-3">{localizedUi("current_status", "Current Status")}</h3>
              <Tag color={statusTagColor[bill.status]} className="rounded-full! px-4! py-1! text-sm! font-semibold! border-0!">
                {localizedStatus(bill.status)}
              </Tag>
              <p className="text-sm text-slate-500 mt-2">
                {bill.status === "verification_review" && localizedUi("description_verification_review", "Review the extracted bill data. Approve or request corrections from the user.")}
                {bill.status === "verified" && localizedUi("description_verified", "Bill data verified. You can now send offers to the user.")}
                {bill.status === "offer_sent" && localizedUi("description_offer_sent", "Offers have been sent. Waiting for the user to select an offer.")}
                {bill.status === "offer_accepted" && localizedUi("description_offer_accepted", "User has accepted an offer. Send them the contract.")}
                {bill.status === "contract_sent" && localizedUi("description_contract_sent", "The customer is signing with the supplier. Move to In Activation once the supplier confirms.")}
                {bill.status === "awaiting_activation" && localizedUi("description_awaiting_activation", "Utility is in activation. Mark as activated when ready.")}
                {bill.status === "activated" && localizedUi("description_activated", "Utility is activated and live.")}
                {bill.status === "analyzing" && localizedUi("description_analyzing", "Bill is being analyzed by the system.")}
                {bill.status === "analyzed" && localizedUi("description_analyzed", "Analysis complete. Moving to verification review.")}
                {bill.status === "verification_required" && localizedUi("description_verification_required", "Waiting for user to provide requested information.")}
              </p>
            </div>

            <CaseActionsPanel
              billStatus={bill.status}
              isTransitioning={isTransitioning}
              onTransition={handleTransition}
              onRequestCorrections={() => setShowVerificationModal(true)}
              onMoveToActivation={openActivationModal}
              onGoToOffers={() => setActiveTab("available_offers")}
            />

            {/* Activated success banner */}
            {bill.status === "activated" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center gap-3">
                <FiCheckCircle className="text-emerald-500 h-6 w-6 flex-shrink-0" />
                <div>
                  <p className="text-emerald-700 font-semibold">{localizedUi("utility_activated", "Utility Activated")}</p>
                  <p className="text-emerald-600 text-sm">{localizedUi("utility_activated_success", "This utility has been successfully activated.")}</p>
                </div>
              </div>
            )}

            {/* Case info section (visible from offer_accepted onward) */}
            {activeCase && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-700 mb-3">{i18n.t("audit.case_information")}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">{i18n.t("audit.case_number")}</span>
                    <p className="font-semibold text-slate-700">{activeCase.caseNumber || "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{i18n.t("notifications.notification_type")}</span>
                    <p className="font-semibold text-slate-700 capitalize">{activeCase.caseType || "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">{i18n.t("support_ticket.priority")}</span>
                    <p className="font-semibold text-slate-700 capitalize">{activeCase.priority || "—"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case "available_offers":
        return (
          <AvailableOffersTab
            offers={allOffers || []}
            isLoading={offersLoading}
            isElectricity={isElectricity}
            selectedRowKeys={selectedRowKeys}
            onSelectionChange={handleSelectionChange}
            onReorderQueued={setSelectedRowKeys}
            savingsOverrides={savingsOverrides}
            onSavingsChange={(offerId, value) =>
              setSavingsOverrides((prev) => ({ ...prev, [offerId]: value }))
            }
            onSendOffers={handleSendOffers}
            onReorderOffers={handleReorderOffers}
            isSending={isSending}
            billStatus={bill.status}
            caseCreated={!!activeCase && !["cancelled", "rejected"].includes(activeCase.status)}
            userSelectedOfferId={activeCase?.selectedOfferId ?? null}
          />
        );
      case "bill_data":
        return (
          <BillDataTab
            bill={bill}
            isTransitioning={isTransitioning}
            handleTransition={handleTransition}
            onRequestCorrections={() => setShowVerificationModal(true)}
            onMoveToActivation={openActivationModal}
            onGoToOffers={() => setActiveTab("available_offers")}
          />
        );
      case "verification":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-700">{localizedDetail("verification_history", "Verification history")}</h3>
              <div className="flex items-center gap-2">
                {/* The uploaded documents are never re-analysed — the admin reads
                    them here and writes the values in by hand. */}
                <Button
                  size="small"
                  icon={<FiEdit2 className="h-3 w-3" />}
                  onClick={() => setVerificationEditOpen(true)}
                >
                  {i18n.t("case_management.edit_bill")}
                </Button>
                {bill.status === "verification_review" && bill.verifications?.some((v: any) => v.status === "submitted") && (
                  <Button danger size="small" onClick={() => setShowVerificationModal(true)}>
                    {localizedDetail("request_further_corrections", "Request further corrections")}
                  </Button>
                )}
              </div>
            </div>
            {bill.verifications && bill.verifications.length > 0 ? (
              [...bill.verifications].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map((v: any, idx: number) => (
                <div key={v.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {/* Round header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">{localizedDetail("round", "Round {{count}}", { count: idx + 1 })}</span>
                      {/* Contract requests are no longer created, but old rounds
                          are still in this list — say which kind each one was. */}
                      {v.type === "contract" && (
                        <Tag color="purple" className="rounded-full! border-0! text-xs!">
                          {localizedDetail("signed_contract", "Signed contract")}
                        </Tag>
                      )}
                      <Tag color={v.status === "pending" ? "orange" : v.status === "submitted" ? "blue" : "green"} className="rounded-full! border-0! text-xs!">
                        {localizedDetail(v.status === "pending" ? "awaiting_user" : v.status === "submitted" ? "user_responded" : "resolved", v.status === "pending" ? "Awaiting user" : v.status === "submitted" ? "User responded" : "Resolved")}
                      </Tag>
                    </div>
                    <span className="text-xs text-slate-400">{fmtDate(v.createdAt)}</span>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Admin request */}
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                      <p className="text-xs font-semibold text-orange-700 mb-2 flex items-center gap-1">
                        <FiSend className="h-3 w-3" /> {localizedDetail("admin_request", "Admin request")}
                      </p>
                      <p className="text-sm text-slate-700">{v.adminMessage}</p>
                    </div>

                    {/* User response */}
                    {v.status !== "pending" && (
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                        <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
                          <LuMessageSquare className="h-3 w-3" /> {localizedDetail("user_response", "User response")}
                        </p>

                        {v.userMessage && (
                          <p className="text-sm text-slate-700 mb-3">{v.userMessage}</p>
                        )}

                        {v.files && v.files.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-400 mb-1">{localizedDetail("uploaded_documents_count", "Uploaded documents ({{count}})", { count: v.files.length })}</p>
                            <VerificationFileList billId={bill.id} files={v.files} />
                          </div>
                        )}

                        {!v.userMessage && (!v.files || v.files.length === 0) && (
                          <p className="text-sm text-slate-400 italic">{localizedDetail("no_documents_submitted", "The user has not submitted any documents.")}</p>
                        )}
                      </div>
                    )}

                    {v.resolvedAt && (
                      <p className="text-xs text-slate-400">{localizedDetail("resolved_on", "Resolved: {{date}}", { date: fmtDate(v.resolvedAt) })}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <Empty description={localizedDetail("no_verification_history", "No verification history")} />
            )}
          </div>
        );
      case "notes":
        return <NotesTab billId={bill.id} />;
      case "case_details":
        return (
          <CaseDetailsTab
            caseId={activeCase?.id ?? null}
            bill={bill}
            onStatusSelect={handleStatusSelect}
            statusUpdating={isTransitioning}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate("/case-management")}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <FiArrowLeft className="h-4 w-4" />
        {i18n.t("case_management.back")}
      </button>

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* ── Header ───────────────────────────────────── */}
        <div className="bg-slate-50/60 px-6 pt-6 pb-0">
          {/* Tags */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Tag className="m-0! rounded-md! border-0! bg-slate-800! px-2.5! py-0.5! text-xs! font-semibold! text-white!">
              #{bill.id.slice(0, 8)}
            </Tag>
            <Tag
              color={isElectricity ? "blue" : "orange"}
              className="m-0! rounded-md! border-0! px-2.5! py-0.5! text-xs! font-semibold!"
            >
              <span className="flex items-center gap-1">
                {isElectricity ? <LuZap className="h-3 w-3" /> : <LuFlame className="h-3 w-3" />}
                {i18n.t(isElectricity ? "home.electricity" : "home.gas")}
              </span>
            </Tag>
            <Tag
              color={statusTagColor[bill.status] || "default"}
              className="m-0! rounded-md! border-0! px-2.5! py-0.5! text-xs! font-semibold!"
            >
              {localizedStatus(bill.status)}
            </Tag>
            {activeCase && (
              <Tag className="m-0! rounded-md! border-0! bg-purple-50! px-2.5! py-0.5! text-xs! font-semibold! text-purple-600!">
                {localizedDetail("case_number", "Case {{number}}", { number: activeCase.caseNumber || activeCase.id.slice(0, 8) })}
              </Tag>
            )}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-slate-800">
            {customerName}
            {bill.supplier && (
              <span className="font-bold">
                {" "}— {bill.supplier.name}
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {bill.podNumber && <>POD {bill.podNumber} • </>}
            {bill.pdrNumber && <>PDR {bill.pdrNumber} • </>}
            {bill.totalAmount != null && <>{localizedDetail("amount_label", "Amount: ")}{fmt(bill.totalAmount)} • </>}
            {localizedDetail("uploaded_on", "Uploaded {{date}}", { date: fmtDate(bill.createdAt) })}
          </p>

          {/* ── Stepper ────────────────────────────────── */}
          <div className="relative flex items-start justify-between mt-8 mb-6 px-2 sm:px-6">
            <div className="absolute top-5 left-[10%] right-[10%] h-[3px] -translate-y-1/2 rounded-full bg-slate-200" />
            <div
              className="absolute top-5 left-[10%] h-[3px] -translate-y-1/2 rounded-full bg-emerald-400 transition-all duration-700"
              style={{ width: `${progressPct * 0.8}%` }}
            />

            {stepConfig.map((step, i) => {
              const s = stepStates[i];
              return (
                <div
                  key={step.label}
                  className="relative z-10 flex flex-col items-center gap-2.5 w-[80px]"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all ${
                      s === "done"
                        ? "bg-emerald-500 text-white"
                        : s === "current"
                          ? "bg-orange-500 text-white ring-4 ring-orange-100"
                          : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {s === "done" ? <FiCheck className="h-5 w-5" /> : i + 1}
                  </div>
                  <span
                    className={`text-[11px] text-center leading-tight ${
                      s === "done"
                        ? "text-emerald-600 font-medium"
                        : s === "current"
                          ? "text-orange-600 font-semibold"
                          : "text-slate-400"
                    }`}
                  >
                    {i18n.t(step.label)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── Case status control ────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200/70 py-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {localizedDetail("case_status", "Case status")}
              </span>
              <CaseStatusSelect
                currentStatus={bill.status}
                onSelect={handleStatusSelect}
                loading={isTransitioning}
              />
            </div>
            <span className="text-xs text-slate-400">
              {localizedDetail("status_help", "Pick any status — forward or backward. The customer is notified of every change.")}
            </span>
          </div>
        </div>

        {/* ── Tabs Navigation ──────────────────────────── */}
        <div className="border-b border-slate-200">
          <div className="flex gap-0 overflow-x-auto px-6">
            {tabKeys.map((tab) => {
              const active = activeTab === tab.key;
              // hide case_details tab if no case exists
              if (tab.key === "case_details" && !activeCase) return null;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-4 py-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    active ? "text-[#7061ED]" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {localizedUi(tab.label, tab.label)}
                  {active && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#7061ED]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab Content ──────────────────────────────── */}
        <div className="p-6">{renderTab()}</div>
      </div>

      {/* Manual bill data edit, opened from the verification review */}
      <EditBillModal
        bill={bill}
        open={verificationEditOpen}
        onClose={() => setVerificationEditOpen(false)}
      />

      {/* Verification Request Modal */}
      <Modal
        title={localizedDetail("request_verification", "Request verification from user")}
        open={showVerificationModal}
        onCancel={() => { setShowVerificationModal(false); setVerificationMessage(""); }}
        onOk={handleSendVerificationRequest}
        confirmLoading={isTransitioning}
        okText={localizedDetail("send_request", "Send request")}
      >
        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium text-slate-700">{localizedDetail("message_to_user", "Message to user")} *</label>
            <Input.TextArea
              rows={4}
              value={verificationMessage}
              onChange={(e) => setVerificationMessage(e.target.value)}
              placeholder={localizedDetail("verification_message_placeholder", "Explain what the user needs to send you...")}
            />
          </div>
          <p className="text-xs text-slate-400">
            {localizedDetail("verification_message_help", "The user will receive this message and can respond by uploading a document or taking a photo from the app.")}
          </p>
        </div>
      </Modal>

      {/* Move to In Activation — the dates come from the supplier, so they are
          collected here rather than stamped automatically. */}
      <Modal
        title={i18n.t("audit.move_to_in_activation")}
        open={showActivationModal}
        onCancel={() => setShowActivationModal(false)}
        onOk={handleMoveToActivation}
        confirmLoading={isTransitioning}
        okText={i18n.t("audit.move_to_in_activation")}
        okButtonProps={{ disabled: !activationDate || !expiryDate }}
      >
        <div className="space-y-4 mt-4">
          <p className="text-sm text-slate-500">
            {i18n.t("audit.the_customer_has_signed_with_the_supplier_enter_the_dates_the_supplier_confirmed_the_customer_sees_them_on_their_utility_straight_away")}
          </p>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              {i18n.t("audit.activation_date")}
            </label>
            <DatePicker
              className="w-full"
              value={activationDate}
              onChange={(d) => {
                setActivationDate(d);
                // An expiry that is no longer after the activation date would be
                // rejected by the server; drop it rather than submit it.
                if (d && expiryDate && !expiryDate.isAfter(d, "day")) setExpiryDate(null);
              }}
              format="DD/MM/YYYY"
              placeholder={i18n.t("audit.select_activation_date")}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">{i18n.t("audit.expiry_date")}</label>
            <DatePicker
              className="w-full"
              value={expiryDate}
              onChange={setExpiryDate}
              disabledDate={(d) => !!activationDate && !d.isAfter(activationDate, "day")}
              format="DD/MM/YYYY"
              placeholder={i18n.t("audit.select_expiry_date")}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ── Available Offers Tab ───────────────────────────────── */

/**
 * The two runs of offers the admin arranges.
 *
 * `sent` is the list the customer already has, and moving within it writes
 * straight through to the server. `queued` is the batch ticked but not yet
 * sent: it is arranged here first and goes out in that order, so the customer's
 * list is right the first time rather than needing a second pass afterwards.
 *
 * They are arranged separately because only one of them exists on the server. A
 * queued offer has no row to renumber yet, so it cannot be dropped among the
 * sent ones; once sent it joins the end of that run and moves freely.
 */
type OfferRun = "sent" | "queued";

/**
 * What a row needs in order to be dropped onto.
 *
 * It travels by context because Ant Design builds the `<tr>` elements itself
 * and gives no way to pass props down to them — only a component to build them
 * with.
 */
type OfferDragState = {
  draggingId: string | null;
  overId: string | null;
  /** Position in the customer's list, 1-based; undefined for an offer in neither run. */
  positionOf: (offerId: string) => number | undefined;
  /** Which run the offer sits in, or null when it is in neither. */
  runOf: (offerId: string) => OfferRun | null;
  /** Whether the offer can be picked up at all — a lone offer has nothing to swap with. */
  canDrag: (offerId: string) => boolean;
  /** The row the offer would land on, or null once the cursor leaves the run. */
  onDragOverRow: (offerId: string | null) => void;
  onDropOnRow: (offerId: string) => void;
};

const OfferDragContext = createContext<OfferDragState | null>(null);

type OfferRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  "data-row-key"?: string;
};

/**
 * A table row that a dragged offer can be dropped onto.
 *
 * The drag starts from the handle in the ORDER cell rather than from the row,
 * because the row carries an editable savings field and a row-wide `draggable`
 * would swallow every attempt to select the text inside it. The row only
 * receives the drop, and marks the edge the offer would land on.
 */
function DroppableOfferRow({ children, className, ...props }: OfferRowProps) {
  const drag = useContext(OfferDragContext);
  const offerId = props["data-row-key"];

  // A row only takes the drop when it shares a run with the offer in flight:
  // the two are arranged in different places — one on the server, one in the
  // batch waiting to go — so an offer cannot cross from one into the other.
  const draggedRun = drag?.draggingId ? drag.runOf(drag.draggingId) : null;
  const ownRun = offerId ? (drag?.runOf(offerId) ?? null) : null;
  const accepts = !!offerId && !!draggedRun && ownRun === draggedRun;

  const isDropTarget =
    !!drag && accepts && drag.overId === offerId && drag.draggingId !== offerId;

  // Dragging down, the offer lands under the row it was dropped on; dragging
  // up, above it. The line is drawn on the cells rather than the row: a
  // collapsed table border swallows a border set on the `<tr>` itself.
  const draggedPosition = drag?.draggingId
    ? drag.positionOf(drag.draggingId)
    : undefined;
  const ownPosition = offerId ? drag?.positionOf(offerId) : undefined;
  const landsBelow =
    isDropTarget &&
    draggedPosition !== undefined &&
    ownPosition !== undefined &&
    ownPosition > draggedPosition;

  return (
    <tr
      {...props}
      onDragOver={(event) => {
        if (!drag?.draggingId || !offerId) return;
        // Dragging out past the run takes the line with it. Without this it
        // would sit on the last offer passed over, pointing at a place the row
        // can no longer be dropped.
        if (!accepts) {
          drag.onDragOverRow(null);
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        drag.onDragOverRow(offerId);
      }}
      onDrop={(event) => {
        if (!drag?.draggingId || !offerId || !accepts) return;
        event.preventDefault();
        drag.onDropOnRow(offerId);
      }}
      className={cn(
        className,
        drag?.draggingId === offerId && "opacity-40",
        isDropTarget &&
          (landsBelow
            ? "[&>td]:border-b-2 [&>td]:border-b-violet-500"
            : "[&>td]:border-t-2 [&>td]:border-t-violet-500"),
      )}
    >
      {children}
    </tr>
  );
}

function AvailableOffersTab({
  offers,
  isLoading: isLoadingOffers,
  isElectricity,
  selectedRowKeys,
  onSelectionChange,
  onReorderQueued,
  savingsOverrides,
  onSavingsChange,
  onSendOffers,
  onReorderOffers,
  isSending,
  billStatus,
  caseCreated,
  userSelectedOfferId,
}: {
  offers: IOfferWithSavings[];
  isLoading: boolean;
  isElectricity: boolean;
  selectedRowKeys: React.Key[];
  onSelectionChange: (keys: React.Key[]) => void;
  onReorderQueued: (keys: React.Key[]) => void;
  savingsOverrides: Record<string, number>;
  onSavingsChange: (offerId: string, value: number) => void;
  onSendOffers: () => void;
  onReorderOffers: (offerIds: string[]) => void;
  isSending: boolean;
  billStatus: string;
  caseCreated: boolean;
  userSelectedOfferId: string | null;
}) {
  const unit = isElectricity ? "kWh" : "Smc";

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [sortedColumn, setSortedColumn] = useState<React.Key | null>(null);
  const [sortDirection, setSortDirection] = useState<SortOrder>(null);

  /**
   * The list the customer already has, in the order the admin put it in. The
   * API returns the sent offers first and already ordered, so this holds
   * whatever they arranged even while an Ant Design sorter is rearranging what
   * is drawn on screen.
   */
  const sentOrder = useMemo(
    () => offers.filter((offer) => offer.isSent).map((offer) => offer.id),
    [offers],
  );

  /**
   * The batch ticked but not yet sent, in the order it will go out in.
   *
   * The tick order is the arrangement — `selectedRowKeys` is kept ordered for
   * exactly this — so the admin settles the customer's order while composing
   * the batch rather than having to fix it up after sending.
   */
  const queuedOrder = useMemo(() => {
    const sent = new Set(sentOrder);
    const known = new Set(offers.map((offer) => offer.id));
    return selectedRowKeys
      .map(String)
      .filter((id) => known.has(id) && !sent.has(id));
  }, [selectedRowKeys, offers, sentOrder]);

  /** Both runs end to end: the places the customer's list will have, in order. */
  const arrangement = useMemo(
    () => [...sentOrder, ...queuedOrder],
    [sentOrder, queuedOrder],
  );
  const positions = useMemo(
    () => new Map(arrangement.map((id, index) => [id, index + 1])),
    [arrangement],
  );
  const sentIds = useMemo(() => new Set(sentOrder), [sentOrder]);
  const queuedIds = useMemo(() => new Set(queuedOrder), [queuedOrder]);

  // A sorter rearranges the rows on screen without touching the arrangement, so
  // dropping a row under one would mean nothing — the position it was let go
  // over is not the position it would take. The handles come back the moment
  // the sort is cleared.
  //
  // Once the customer has chosen, the app stops showing them this bill's offers
  // at all, so there is no list left to arrange either.
  const isSorted = sortDirection !== null && sortedColumn !== null;
  const reorderingAllowed = !isSorted && !caseCreated;

  const runOf = (offerId: string): OfferRun | null =>
    sentIds.has(offerId) ? "sent" : queuedIds.has(offerId) ? "queued" : null;

  const runFor = (run: OfferRun) => (run === "sent" ? sentOrder : queuedOrder);

  /** A run of one has nothing to swap with, so its handle stays inert. */
  const canDrag = (offerId: string) => {
    const run = runOf(offerId);
    return reorderingAllowed && run !== null && runFor(run).length > 1;
  };

  /**
   * Moves an offer within its own run. A sent offer is renumbered on the
   * server; a queued one only rearranges the batch that has yet to go out.
   */
  const move = (offerId: string, toIndex: number) => {
    const run = runOf(offerId);
    if (!run) return;
    const list = runFor(run);
    const fromIndex = list.indexOf(offerId);
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      toIndex >= list.length ||
      toIndex === fromIndex
    ) {
      return;
    }
    const next = [...list];
    next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
    if (run === "sent") onReorderOffers(next);
    else onReorderQueued(next);
  };

  /** Puts the keyboard back on the handle after the row moved out from under it. */
  const refocusHandle = (offerId: string) => {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-offer-handle="${offerId}"]`)
        ?.focus();
    });
  };

  const dragState: OfferDragState = {
    draggingId,
    overId,
    positionOf: (offerId) => positions.get(offerId),
    runOf,
    canDrag,
    onDragOverRow: (offerId) => setOverId((current) => (current === offerId ? current : offerId)),
    onDropOnRow: (offerId) => {
      const run = draggingId ? runOf(draggingId) : null;
      if (draggingId && run) move(draggingId, runFor(run).indexOf(offerId));
      setDraggingId(null);
      setOverId(null);
    },
  };

  /**
   * The rows in the order they are arranged: the customer's list first, then
   * the batch waiting to go, then the rest of the catalogue in the price order
   * the API gave it. Ticking an offer lifts it into the run so it sits next to
   * the others it will be sent with, and can be dragged among them.
   */
  const orderedOffers = useMemo(() => {
    const rank = new Map(arrangement.map((id, index) => [id, index]));
    return [...offers].sort((a, b) => {
      const left = rank.get(a.id);
      const right = rank.get(b.id);
      if (left === undefined && right === undefined) return 0;
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      return left - right;
    });
  }, [offers, arrangement]);

  const columns: ColumnsType<IOfferWithSavings> = [
    {
      title: localizedDetail("order", "ORDER"),
      key: "displayOrder",
      width: 78,
      render: (_, record) => {
        const position = positions.get(record.id);
        if (position === undefined) {
          return (
            <Tooltip title={localizedDetail("offer_order_unselected_tooltip", "Tick this offer to give it a place in the customer's list, then drag it where you want it.")}>
              <span className="text-xs text-slate-300">—</span>
            </Tooltip>
          );
        }
        const run = runOf(record.id);
        const draggable = canDrag(record.id);
        return (
          <div className="flex items-center gap-1.5">
            <Tooltip
              title={
                draggable
                  ? run === "queued"
                    ? localizedDetail("queued_drag_tooltip", "Drag to set the order these will be sent in — or focus this handle and use ↑ ↓")
                    : localizedDetail("sent_drag_tooltip", "Drag to set the order the customer sees — or focus this handle and use ↑ ↓")
                  : caseCreated
                    ? localizedDetail("customer_chose_tooltip", "The customer has already chosen — the order no longer changes what they see")
                    : isSorted
                      ? localizedDetail("clear_sort_tooltip", "Clear the column sort to rearrange the order")
                      : run === "queued"
                        ? localizedDetail("arrange_batch_tooltip", "Tick another offer to arrange the batch before sending it")
                        : localizedDetail("nothing_to_reorder_tooltip", "There is nothing to reorder yet — only one offer has been sent")
              }
            >
              <span
                data-offer-handle={record.id}
                role="button"
                aria-label={
                  localizedDetail("reorder_offer_aria", "Reorder {{name}}, position {{position}} of {{count}}", { name: record.name, position, count: arrangement.length }) +
                  (run === "queued" ? ` — ${localizedDetail("waiting_to_send", "waiting to be sent")}` : "")
                }
                aria-disabled={!draggable}
                tabIndex={draggable ? 0 : -1}
                draggable={draggable}
                onDragStart={(event) => {
                  const row = event.currentTarget.closest("tr");
                  // Without this the ghost following the cursor is the handle
                  // alone, and there is no telling which offer is in flight.
                  if (row) {
                    event.dataTransfer.setDragImage(row, 24, row.clientHeight / 2);
                  }
                  event.dataTransfer.effectAllowed = "move";
                  // Firefox refuses to start a drag that carries no data.
                  event.dataTransfer.setData("text/plain", record.id);
                  setDraggingId(record.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setOverId(null);
                }}
                onKeyDown={(event) => {
                  if (!draggable || !run) return;
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                  event.preventDefault();
                  const withinRun = runFor(run).indexOf(record.id);
                  move(record.id, withinRun + (event.key === "ArrowUp" ? -1 : 1));
                  refocusHandle(record.id);
                }}
                className={cn(
                  "flex items-center rounded text-slate-300 outline-none",
                  draggable
                    ? "cursor-grab hover:text-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400 active:cursor-grabbing"
                    : "cursor-not-allowed",
                )}
              >
                <LuGripVertical className="h-4 w-4" />
              </span>
            </Tooltip>
            <Tooltip
              title={
                run === "queued"
                  ? localizedDetail("queued_position_tooltip", "Position {{position}} of {{count}} once this batch is sent", { position, count: arrangement.length })
                  : undefined
              }
            >
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  run === "queued"
                    ? "text-amber-600 underline decoration-dashed decoration-amber-400 underline-offset-4"
                    : "text-slate-700",
                )}
              >
                {position}
              </span>
            </Tooltip>
          </div>
        );
      },
      align: "left",
    },
    {
      title: localizedDetail("offer", "OFFER"),
      key: "name",
      width: 200,
      render: (_, record) => (
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{record.name}</p>
          <p className="text-xs text-slate-400 truncate">{record.supplier?.name || "—"}</p>
          {positions.get(record.id) === 1 && (
            <span
              className={cn(
                "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                runOf(record.id) === "queued"
                  ? "bg-amber-50 text-amber-600"
                  : "bg-violet-50 text-violet-600",
              )}
            >
              <LuStar className="h-2.5 w-2.5" />
              {runOf(record.id) === "queued"
                ? localizedDetail("will_be_shown_first", "Will be shown first")
                : localizedDetail("shown_first_in_app", "Shown first in app")}
            </span>
          )}
        </div>
      ),
    },
    {
      title: localizedDetail("type", "TYPE"),
      key: "energyType",
      width: 100,
      render: (_, record) => (
        <Tag
          color={record.energyType === "electricity" ? "blue" : record.energyType === "gas" ? "orange" : "purple"}
          className="border-0 rounded text-[10px] font-bold uppercase"
        >
          {i18n.t(`suppliers.commodities.${record.energyType}`, { defaultValue: record.energyType })}
        </Tag>
      ),
      align: "center",
    },
    {
      title: localizedDetail("market", "MARKET"),
      key: "marketType",
      width: 90,
      render: (_, record) => (
        <span className="text-xs font-medium text-slate-600">{i18n.t(`offers_market.price_${record.marketType}`, { defaultValue: record.marketType })}</span>
      ),
      align: "center",
    },
    {
      title: i18n.t("audit.price_per_unit_column", { unit: unit.toUpperCase() }),
      key: "price",
      width: 110,
      render: (_, record) => {
        const price = (record.marketType === "variable" || record.marketType === "indexed")
          ? record.spread
          : (isElectricity ? record.pricePerKwh : record.pricePerSmc);
        return (
          <span className="text-sm font-bold text-slate-700">
            {formatUnitPrice(price)}
          </span>
        );
      },
      sorter: (a, b) => {
        const getPrice = (r: typeof a) =>
          (r.marketType === "variable" || r.marketType === "indexed")
            ? (r.spread ?? 999)
            : (isElectricity ? (r.pricePerKwh ?? 999) : (r.pricePerSmc ?? 999));
        return getPrice(a) - getPrice(b);
      },
      sortOrder: sortedColumn === "price" ? sortDirection : null,
      align: "right",
    },
    {
      title: localizedDetail("fixed_fee", "FIXED FEE"),
      key: "fixedFee",
      width: 90,
      render: (_, record) => (
        <span className="text-xs text-slate-600">{formatMoney(record.fixedMonthlyFee)}</span>
      ),
      align: "right",
    },
    {
      title: localizedDetail("duration", "DURATION"),
      key: "duration",
      width: 80,
      render: (_, record) => (
        <span className="text-xs text-slate-600">{formatContractDuration(record)}</span>
      ),
      align: "center",
    },
    {
      title: "",
      key: "green",
      width: 40,
      render: (_, record) =>
        record.isGreenEnergy ? (
          <Tooltip title={i18n.t("offers_market.green_energy")}>
            <LuLeaf className="h-4 w-4 text-emerald-500" />
          </Tooltip>
        ) : null,
      align: "center",
    },
    {
      title: localizedDetail("compensation", "COMPENSATION"),
      key: "compensation",
      width: 150,
      render: (_, record) => (
        <span className="text-xs text-slate-600 line-clamp-2">{record.compensation || "—"}</span>
      ),
    },
    {
      title: i18n.t("offers_market.payment_method"),
      key: "paymentMethod",
      width: 150,
      render: (_, record) => (
        <span className="text-xs text-slate-600">
          {i18n.t(`offers_market.${record.paymentMethod}`, { defaultValue: PAYMENT_METHOD_LABELS[record.paymentMethod] || "—" })}
        </span>
      ),
    },
    {
      title: localizedDetail("estimated_savings", "EST. SAVINGS"),
      key: "savings",
      width: 140,
      render: (_, record) => (
        <InputNumber
          size="small"
          min={0}
          step={0.01}
          precision={2}
          prefix="€"
          value={savingsOverrides[record.id] ?? record.estimatedSavings}
          onChange={(val) => onSavingsChange(record.id, val ?? 0)}
          className="w-full [&_input]:text-right"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      sorter: (a, b) => {
        const sa = savingsOverrides[a.id] ?? a.estimatedSavings;
        const sb = savingsOverrides[b.id] ?? b.estimatedSavings;
        return sa - sb;
      },
      sortOrder: sortedColumn === "savings" ? sortDirection : null,
      align: "right",
    },
    {
      title: "",
      key: "sentStatus",
      width: 120,
      render: (_, record) => (
        <div className="flex flex-col items-center gap-1">
          {record.id === userSelectedOfferId && (
            <Tag color="purple" className="border-0! rounded-full! text-[10px]! font-bold! m-0!">
              {localizedDetail("user_selected", "User selected")}
            </Tag>
          )}
          {record.isSent && record.id !== userSelectedOfferId && (
            <Tag color="green" className="border-0! rounded-full! text-[10px]! font-bold! m-0!">
              {localizedDetail("already_sent", "Already sent")}
            </Tag>
          )}
        </div>
      ),
      align: "center",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Pending email banner */}
      {billStatus === "pending_email" && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3">
          <p className="text-sm font-semibold text-purple-800">
            {localizedDetail("email_bill_pending", "This bill was submitted via email and is awaiting document upload.")}
          </p>
          <p className="text-xs text-purple-600 mt-0.5">
            {localizedDetail("upload_bill_before_offers", "Upload the bill document through the OCR tab before sending offers.")}
          </p>
        </div>
      )}

      {/* Case created banner */}
      {caseCreated && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3">
          <p className="text-sm font-semibold text-purple-800">
            {localizedDetail("offer_accepted_case_created", "The user has accepted an offer and a case has been created.")}
          </p>
          <p className="text-xs text-purple-600 mt-0.5">
            {localizedDetail("offers_locked_after_acceptance", "No more offers can be sent for this bill. The user's selected offer is highlighted below.")}
          </p>
        </div>
      )}

      {/* Send action bar */}
      {!caseCreated && billStatus !== "pending_email" && selectedRowKeys.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              {selectedRowKeys.length === 1
                ? localizedDetail("offer_selected", "{{count}} offer selected", { count: selectedRowKeys.length })
                : localizedDetail("offers_selected", "{{count}} offers selected", { count: selectedRowKeys.length })}
            </p>
            {queuedOrder.length > 1 && !isSorted && (
              <p className="text-xs text-emerald-700 mt-0.5">
                {localizedDetail("offers_selected_order_help", "They will be sent in the order shown at the top of the table — drag the handles to change it before sending.")}
              </p>
            )}
          </div>
          <Button
            type="primary"
            icon={<FiSend className="h-3.5 w-3.5" />}
            loading={isSending}
            onClick={onSendOffers}
            className="!bg-emerald-500 hover:!bg-emerald-600 border-0 rounded-lg h-9 px-5 font-semibold"
          >
            {localizedDetail("send_selected_offers", "Send selected offers")}
          </Button>
        </div>
      )}

      {!caseCreated && (() => {
        const sentCount = sentOrder.length;
        if (billStatus === "offer_sent" || sentCount > 0) {
          return (
            <div className="rounded-lg bg-cyan-50 px-3 py-2">
              <p className="text-xs text-cyan-700">
                {sentCount > 0
                  ? sentCount === 1
                    ? localizedDetail("offer_already_sent_count", "{{count}} offer has already been sent to the user. You can still select and send more.", { count: sentCount })
                    : localizedDetail("offers_already_sent_count", "{{count}} offers have already been sent to the user. You can still select and send more.", { count: sentCount })
                  : localizedDetail("offers_already_sent", "Offers have already been sent for this bill. You can still select and send additional offers.")}
              </p>
            </div>
          );
        }
        return null;
      })()}

      {/* How the order works, and how to get the handles back when a sort hides them */}
      {arrangement.length > 1 && !caseCreated && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2">
          <p className="text-xs text-violet-700">
            {isSorted ? (
              <>
                {localizedDetail("sorted_offers_help", "The rows are sorted for browsing only — the customer still sees the order you set. Clear the sort to rearrange it.")}
              </>
            ) : (
              <>
                <span className="font-semibold">
                  {localizedDetail("drag_offers_help", "Drag the handles to set the order the customer sees.")}
                </span>{" "}
                {localizedDetail("top_offer_help", "The offer at the top is shown first in the app. Nothing is re-sorted by price or savings on top of it.")}
                {queuedOrder.length > 0 && sentOrder.length > 0 && (
                  <>
                    {" "}
                    {localizedDetail("queued_offer_position_help", "The amber positions are the batch you have yet to send: arrange it now and it joins the end of the list in that order.")}
                  </>
                )}
              </>
            )}
          </p>
          {isSorted && (
            <Button
              size="small"
              onClick={() => {
                setSortedColumn(null);
                setSortDirection(null);
              }}
            >
              {localizedDetail("clear_sort", "Clear sort")}
            </Button>
          )}
        </div>
      )}

      {isLoadingOffers ? (
        <div className="flex items-center justify-center py-12">
          <Spin size="large" />
        </div>
      ) : offers.length === 0 ? (
        <Empty description={localizedDetail("no_active_offers", "No active offers available for this bill type")} />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <LuPackageSearch className="h-4 w-4 text-amber-500" />
            <h4 className="text-sm font-semibold text-slate-800">
              {localizedDetail("available_offers_count", "Available offers ({{count}})", { count: offers.length })}
              {sentOrder.length > 0 && (
                <span className="text-slate-400 font-normal ml-1">
                  ({localizedDetail("offers_already_sent_short", "{{count}} already sent", { count: sentOrder.length })})
                </span>
              )}
            </h4>
          </div>
          <OfferDragContext.Provider value={dragState}>
            <Table<IOfferWithSavings>
              rowKey="id"
              columns={columns}
              dataSource={orderedOffers}
              size="small"
              // Paging would put part of the arranged run on one page and the
              // drop targets on another, so it has to stay whole. Only the
              // catalogue below it is paged.
              pagination={
                offers.length > Math.max(20, arrangement.length)
                  ? {
                      pageSize: Math.max(20, arrangement.length),
                      showSizeChanger: false,
                    }
                  : false
              }
              scroll={{ x: 980 }}
              onChange={(_pagination, _filters, sorter) => {
                const active = Array.isArray(sorter) ? sorter[0] : sorter;
                setSortedColumn(active?.order ? (active.columnKey ?? null) : null);
                setSortDirection(active?.order ?? null);
              }}
              components={{ body: { row: DroppableOfferRow } }}
              rowSelection={caseCreated || billStatus === "pending_email" ? undefined : {
                type: "checkbox",
                selectedRowKeys,
                onChange: onSelectionChange,
                getCheckboxProps: (record: IOfferWithSavings) => ({
                  disabled: record.isSent === true,
                }),
              }}
              rowClassName={(record) =>
                record.id === userSelectedOfferId ? "bg-purple-50/70" : ""
              }
              className="[&_.ant-table-thead_th]:bg-slate-50/50 [&_.ant-table-thead_th]:text-slate-500 [&_.ant-table-thead_th]:text-[10px] [&_.ant-table-thead_th]:font-bold [&_.ant-table-thead_th]:uppercase [&_.ant-table-thead_th]:tracking-widest [&_.ant-table-row]:hover:bg-slate-50/30 [&_.ant-table-cell]:py-3"
            />
          </OfferDragContext.Provider>
        </>
      )}
    </div>
  );
}

/* ── Bill Data Tab ──────────────────────────────────────── */

function BillDataTab({
  bill,
  isTransitioning,
  handleTransition,
  onRequestCorrections,
  onMoveToActivation,
  onGoToOffers,
}: {
  bill: IBill;
  isTransitioning: boolean;
  handleTransition: (status: string) => void;
  onRequestCorrections: () => void;
  onMoveToActivation: () => void;
  onGoToOffers: () => void;
}) {
  useTranslation();
  const isElectricity = bill.billType === "electricity";
  const token = useAppSelector((state) => state.auth.token);
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"pdf" | "image" | "other">("other");

  const billFiles: IBillFile[] = bill.files ?? [];
  const originalFiles = billFiles.filter((f) => !f.verificationId);
  const reuploadedFiles = billFiles.filter((f) => !!f.verificationId);

  const fetchFileBlobByUrl = useCallback(async (url: string) => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.blob();
  }, [token]);

  const detectFileType = (blob: Blob, fileUrl?: string): "pdf" | "image" | "other" => {
    const mime = blob.type.toLowerCase();
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("image/")) return "image";
    if (fileUrl?.toLowerCase().endsWith(".pdf")) return "pdf";
    if (fileUrl && /\.(jpg|jpeg|png)$/i.test(fileUrl)) return "image";
    return "other";
  };

  const handleView = async (bf: IBillFile) => {
    setPreviewLoading(bf.id);
    try {
      const url = `${server_url}bills/${bill.id}/files/${bf.id}`;
      const blob = await fetchFileBlobByUrl(url);
      setPreviewType(detectFileType(blob, bf.fileUrl));
      const objUrl = URL.createObjectURL(blob);
      setPreviewUrl(objUrl);
      setPreviewOpen(true);
    } catch {
      message.error(i18n.t("case_management.load_document_failed"));
    } finally {
      setPreviewLoading(null);
    }
  };

  const handleDownload = async (bf: IBillFile) => {
    try {
      const ext = bf.fileUrl?.split(".").pop() || "pdf";
      await downloadAuthedFile(
        `${server_url}bills/${bill.id}/files/${bf.id}`,
        token,
        bf.originalName || `bill-${bill.id.slice(0, 8)}.${ext}`,
      );
    } catch {
      message.error(i18n.t("case_management.download_document_failed"));
    }
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const groups = [
    {
      title: localizedDetail("bill_overview", "Bill overview"),
      rows: [
        {
          label: localizedDetail("bill_type", "Bill type"),
          value: (
            <Tag color={isElectricity ? "blue" : "orange"} className="m-0!">
              <span className="flex items-center gap-1">
                {isElectricity ? <LuZap className="h-3 w-3" /> : <LuFlame className="h-3 w-3" />}
                {i18n.t(isElectricity ? "home.electricity" : "home.gas")}
              </span>
            </Tag>
          ),
        },
        {
          label: localizedDetail("status", "Status"),
          value: (
            <Tag color={statusTagColor[bill.status] || "default"} className="m-0!">
              {localizedStatus(bill.status)}
            </Tag>
          ),
        },
        { label: localizedDetail("upload_date", "Upload date"), value: fmtDate(bill.createdAt) },
        { label: localizedDetail("last_updated", "Last updated"), value: fmtDate(bill.updatedAt) },
        {
          label: billFiles.length > 0
            ? localizedDetail("uploaded_documents_count", "Uploaded documents ({{count}})", { count: billFiles.length })
            : localizedDetail("uploaded_documents", "Uploaded documents"),
          value: billFiles.length > 0 ? (
            <div className="space-y-3">
              {/* Original Upload */}
              {originalFiles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">{localizedDetail("original_upload", "Original upload")}</p>
                  <div className="space-y-2">
                    {originalFiles.map((bf, idx) => (
                      <div key={bf.id} className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 font-mono w-4">{idx + 1}.</span>
                        <span className="text-xs text-slate-600 truncate max-w-[120px]">
                          {bf.originalName || bf.fileUrl.split("/").pop()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleView(bf)}
                          disabled={previewLoading === bf.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
                        >
                          <FiEye className="h-3 w-3" />
                          {previewLoading === bf.id ? "..." : i18n.t("case_management.view")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(bf)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 transition-colors"
                        >
                          <LuDownload className="h-3 w-3" />
                          {i18n.t("case_management.download")}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Re-uploaded Documents */}
              {reuploadedFiles.length > 0 && (
                <div>
                  {originalFiles.length > 0 && <div className="border-t border-slate-200 my-2" />}
                  <p className="text-xs font-semibold text-slate-500 mb-1">{localizedDetail("reuploaded_documents", "Re-uploaded documents")}</p>
                  <div className="space-y-2">
                    {reuploadedFiles.map((bf, idx) => (
                      <div key={bf.id} className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 font-mono w-4">{idx + 1}.</span>
                        <span className="text-xs text-slate-600 truncate max-w-[120px]">
                          {bf.originalName || bf.fileUrl.split("/").pop()}
                        </span>
                        <Tag color="blue" className="text-[10px]! leading-tight! px-1! py-0! m-0!">{localizedDetail("reupload", "Re-upload")}</Tag>
                        <button
                          type="button"
                          onClick={() => handleView(bf)}
                          disabled={previewLoading === bf.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
                        >
                          <FiEye className="h-3 w-3" />
                          {previewLoading === bf.id ? "..." : i18n.t("case_management.view")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(bf)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 transition-colors"
                        >
                          <LuDownload className="h-3 w-3" />
                          {i18n.t("case_management.download")}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : bill.fileUrl ? (
            <span className="text-xs text-slate-500">{localizedDetail("legacy_file", "1 file (legacy)")}</span>
          ) : "—",
        },
      ],
    },
    {
      title: localizedDetail("financial_breakdown", "Financial breakdown"),
      rows: [
        { label: localizedDetail("total_amount", "Total amount"), value: fmt(bill.totalAmount) },
        {
          label: localizedDetail("cost_per_unit", "Cost per unit"),
          value: formatUnitPrice(bill.costPerUnit, undefined, { fallback: null }),
        },
        { label: localizedDetail("fixed_charges", "Fixed charges"), value: fmt(bill.fixedCharges) },
        { label: localizedDetail("taxes", "Taxes"), value: fmt(bill.taxes) },
        {
          label: localizedDetail("consumption", "Consumption ({{unit}})", { unit: isElectricity ? "kWh" : "Smc" }),
          value: fmtNum(
            isElectricity ? bill.consumptionKwh : bill.consumptionSmc,
            isElectricity ? "kWh" : "Smc",
          ),
        },
        {
          label: localizedDetail("billing_period", "Billing period"),
          value:
            bill.billingPeriodStart || bill.billingPeriodEnd
              ? `${fmtDate(bill.billingPeriodStart)} — ${fmtDate(bill.billingPeriodEnd)}`
              : null,
        },
      ],
    },
    {
      title: localizedDetail("customer_information", "Customer information"),
      rows: [
        {
          label: localizedDetail("name", "Name"),
          value: bill.user
            ? `${bill.user.firstName} ${bill.user.lastName}`
            : bill.customerName || null,
        },
        { label: localizedDetail("email", "Email"), value: bill.user?.email || null },
        // A company's certified address, which is its own and not the mailbox
        // the account signs in with. Absent for a private customer.
        ...(bill.user?.businessProfile?.pecEmail
          ? [{ label: "PEC", value: bill.user.businessProfile.pecEmail }]
          : []),
        { label: localizedDetail("supply_address", "Supply address"), value: bill.supplyAddress || null },
        { label: localizedDetail("codice_fiscale", "Codice Fiscale"), value: bill.codiceFiscale || null },
        { label: localizedDetail("partita_iva", "Partita IVA"), value: bill.partitaIva || null },
      ],
    },
    {
      title: localizedDetail("supply_details", "Supply details"),
      rows: [
        { label: localizedDetail("supplier", "Supplier"), value: bill.supplierName || bill.supplier?.name || (bill.rawAnalysisData?.ocrSupplierName as string) || null },
        { label: isElectricity ? "POD" : "PDR", value: (isElectricity ? bill.podNumber : bill.pdrNumber) || null },
        ...(isElectricity && bill.pdrNumber ? [{ label: "PDR", value: bill.pdrNumber }] : []),
        ...(!isElectricity && bill.podNumber ? [{ label: "POD", value: bill.podNumber }] : []),
        { label: localizedDetail("contract_number", "Contract number"), value: bill.contractNumber || null },
        { label: localizedDetail("meter_number", "Meter number"), value: bill.meterNumber || null },
        ...(bill.meterId ? [{ label: localizedDetail("meter_id", "Meter ID"), value: bill.meterId }] : []),
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">{i18n.t("case_management.ui.bill_data")}</h4>
        <Button
          type="primary"
          size="small"
          icon={<FiEdit2 className="h-3 w-3" />}
          onClick={() => setEditOpen(true)}
        >
          {i18n.t("case_management.edit_bill")}
        </Button>
      </div>

      <CaseActionsPanel
        billStatus={bill.status}
        isTransitioning={isTransitioning}
        onTransition={handleTransition}
        onRequestCorrections={onRequestCorrections}
        onMoveToActivation={onMoveToActivation}
        onGoToOffers={onGoToOffers}
      />

      {/* Activated success banner */}
      {bill.status === "activated" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-center gap-3">
          <FiCheckCircle className="text-emerald-500 h-6 w-6 flex-shrink-0" />
          <div>
            <p className="text-emerald-700 font-semibold">{localizedUi("utility_activated", "Utility activated")}</p>
            <p className="text-emerald-600 text-sm">{localizedUi("utility_activated_success", "This utility has been successfully activated.")}</p>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.title}>
          <h4 className="text-sm font-semibold text-slate-800 mb-4">{g.title}</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.rows.map((r) => (
              <div key={r.label}>
                <span className="text-xs text-slate-400">{r.label}</span>
                {r.value ? (
                  <div className="text-sm font-medium text-slate-700 mt-0.5">{r.value}</div>
                ) : (
                  <p className="text-xs italic text-amber-500 mt-0.5">{localizedDetail("not_found_in_document", "Not found in document")}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <EditBillModal bill={bill} open={editOpen} onClose={() => setEditOpen(false)} />

      {/* Document Preview Modal */}
      <Modal
        open={previewOpen}
        onCancel={handleClosePreview}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={handleClosePreview}>{i18n.t("case_management.close")}</Button>
          </div>
        }
        title={
          <span className="flex items-center gap-2">
            <FiFileText className="h-4 w-4 text-indigo-500" />
            {localizedDetail("bill_document", "Bill document")}
          </span>
        }
        width={900}
        centered
        destroyOnClose
      >
        {previewUrl && (
          <div className="flex items-center justify-center bg-slate-50 rounded-lg overflow-hidden" style={{ minHeight: 500 }}>
            {previewType === "pdf" ? (
              <iframe
                src={previewUrl}
                title={localizedDetail("bill_document", "Bill document")}
                className="w-full border-0 rounded-lg"
                style={{ height: 600 }}
              />
            ) : previewType === "image" ? (
              <img
                src={previewUrl}
                alt={localizedDetail("bill_document", "Bill document")}
                className="max-w-full max-h-[600px] object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-12">
                <FiFileText className="h-12 w-12 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {i18n.t("case_management.preview_unavailable")}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── Case Details Tab ───────────────────────────────────── */


const caseSubTabs: { key: string; label: string; counted?: boolean }[] = [
  { key: "case_data", get label() { return i18n.t("audit.case_overview"); } },
  { key: "timeline", get label() { return i18n.t("audit.timeline"); } },
  { key: "documents", get label() { return i18n.t("faq_management.category_documents"); }, counted: true },
  { key: "activation", get label() { return i18n.t("case_management.steps.activation"); } },
];

function CaseDetailsTab({
  caseId,
  bill,
  onStatusSelect,
  statusUpdating,
}: {
  caseId: string | null;
  /** The bill this case was opened from — the overview quotes the OCR off it. */
  bill: IBill;
  onStatusSelect: (status: string) => void;
  statusUpdating: boolean;
}) {
  useTranslation();
  const { data: caseData, isLoading } = useGetCaseByIdQuery(caseId!, { skip: !caseId });
  const [subTab, setSubTab] = useState("case_data");
  const billStatus = bill.status;

  if (!caseId) {
    return (
      <div className="py-12">
        <Empty description={i18n.t("audit.no_case_created_yet_for_this_bill_request")} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spin size="large" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="py-12">
        <Empty description={i18n.t("audit.case_not_found")} />
      </div>
    );
  }

  const events = [...(caseData.events || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const docCount = caseData.documents?.length || 0;

  const customerName = caseData.user
    ? `${caseData.user.firstName} ${caseData.user.lastName}`
    : "—";

  const tabCounts: Record<string, number> = { documents: docCount };

  const renderSubTab = () => {
    switch (subTab) {
      case "timeline":
        return <CaseTimeline events={events} />;
      case "case_data":
        return <CaseDataSection caseData={caseData} bill={bill} customerName={customerName} />;
      case "documents":
        return <CaseDocumentsSection documents={caseData.documents || []} caseId={caseData.id} />;
      case "activation":
        return <CaseActivationSection caseData={caseData} billStatus={billStatus} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      {/* Case Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tag className="m-0! rounded-md! border-0! bg-slate-800! px-2.5! py-0.5! text-xs! font-semibold! text-white!">
            {caseData.caseNumber || `#${caseData.id.slice(0, 8)}`}
          </Tag>
          {/* Pipeline status — the same value the dropdown on the right sets */}
          <Tag
            color={statusTagColor[billStatus] || "default"}
            className="m-0! rounded-md! border-0! px-2.5! py-0.5! text-xs! font-semibold!"
          >
            {localizedStatus(billStatus)}
          </Tag>
          <Tag className="m-0! rounded-md! border-0! bg-orange-50! px-2.5! py-0.5! text-xs! font-semibold! text-orange-600! capitalize!">
            {caseData.caseType?.replace("_", " ")}
          </Tag>
          {caseData.slaDeadline && (
            (() => {
              const daysLeft = Math.ceil(
                (new Date(caseData.slaDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
              );
              return (
                <span
                  className={`flex items-center gap-1 text-xs font-semibold ${
                    daysLeft <= 5 ? "text-red-500" : daysLeft <= 10 ? "text-amber-500" : "text-emerald-500"
                  }`}
                >
                  <LuClock3 className="h-3.5 w-3.5" />
                  SLA: {daysLeft > 0 ? i18n.t("audit.sla_days_left", { count: daysLeft }) : i18n.t("audit.sla_overdue")}
                </span>
              );
            })()
          )}
        </div>
        <CaseStatusSelect
          currentStatus={billStatus}
          onSelect={onStatusSelect}
          loading={statusUpdating}
          size="small"
        />
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-slate-100">
        <div className="flex gap-0 overflow-x-auto">
          {caseSubTabs.map((tab) => {
            const active = subTab === tab.key;
            const count = tab.counted ? tabCounts[tab.key] : null;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSubTab(tab.key)}
                className={`relative px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active ? "text-[#7061ED]" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {count != null && count > 0 && (
                    <span
                      className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                        active ? "bg-[#7061ED] text-white" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </span>
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#7061ED]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab Content */}
      <div>{renderSubTab()}</div>
    </div>
  );
}

/* ── Case Sub-sections ──────────────────────────────────── */

/** One address block, in the shape every address on a case is stored. */
type CaseAddress = {
  street: string | null;
  streetNumber: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
};

/** Renders the five address fields as "Via Roma 10, 20100 Milano (MI)". */
const fmtAddress = (a: CaseAddress): string => {
  const street = [a.street, a.streetNumber].filter(Boolean).join(" ").trim();
  const town = [
    [a.postalCode, a.city].filter(Boolean).join(" ").trim(),
    a.province ? `(${a.province})` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return [street, town].filter(Boolean).join(", ") || "—";
};

/** Translation keys for the enum values the case overview spells out. */
const paymentMethodKey: Record<string, string> = {
  rid_bancario: "audit.direct_debit_sdd",
  postal_order: "offers_market.postal_order",
  credit_card: "client_management.payment_credit_card",
  bank_transfer: "client_management.payment_bank_transfer",
};

const invoiceDeliveryKey: Record<string, string> = {
  digital: "audit.digital_by_email",
  paper: "audit.paper_by_post",
};

const documentTypeKey: Record<string, string> = {
  identity_document: "audit.doc_identity_document",
  id_card: "audit.doc_id_card",
  codice_fiscale: "case_management.detail.codice_fiscale",
  partita_iva: "case_management.detail.partita_iva",
  bill: "audit.doc_bill",
  contract: "audit.doc_contract",
  signed_contract: "case_management.detail.signed_contract",
};

/** Label for an enum value, or the raw value when it has no translation. */
const enumLabel = (keys: Record<string, string>, value: string) =>
  keys[value] ? i18n.t(keys[value]) : value;

type DataRow = {
  label: string;
  value: React.ReactNode;
  /**
   * Title-cases the value. Opt-in rather than opt-out: nearly everything a case
   * holds is an identifier or something a person typed — capitalising a
   * province entered "mi" would render it "Mi" — and only the handful of enum
   * values stored lower-cased actually want it.
   */
  cap?: boolean;
  /**
   * Puts the label on its own line with the value beneath it, across the whole
   * card. For the rows whose value is a file name — a half-width column in a
   * four-across grid truncates those to three characters.
   */
  stacked?: boolean;
};

/** One numbered card of the case overview grid. */
type DataCard = {
  /** Identifies the card across rearrangements — never its position. */
  key: CardKey;
  title: string;
  rows?: DataRow[];
  /** Cards whose contents are not label/value pairs — addresses, documents. */
  content?: React.ReactNode;
};

/**
 * Hands the browser a file the API only serves to an authenticated request.
 *
 * An anchor cannot point straight at the endpoint — both bill files and case
 * documents sit behind the bearer token — so the bytes are fetched first and
 * offered as an object URL. Throws on a failed fetch; the caller decides what
 * to tell the admin.
 */
async function downloadAuthedFile(url: string, token: string | null, fileName: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(String(res.status));
  const objectUrl = URL.createObjectURL(await res.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

/**
 * What this supply uses in a year, mirroring `MetersService.annualConsumption`
 * on the server so the admin reads the same figure the customer sees in the
 * app: the consumption printed on the bill scaled by how many of its own
 * billing periods fit in a year, falling back to six — the common Italian
 * bimonthly cycle — for a bill the OCR read a consumption off but no dates.
 * Null when there is no consumption at all, so the row shows a dash rather
 * than a zero the admin would read as a fact.
 */
function annualConsumption(bill: IBill): number | null {
  const raw = bill.billType === "gas" ? bill.consumptionSmc : bill.consumptionKwh;
  const consumption = raw == null ? null : Number(raw);
  if (consumption == null || !Number.isFinite(consumption) || consumption <= 0) return null;

  const start = bill.billingPeriodStart ? new Date(bill.billingPeriodStart).getTime() : NaN;
  const end = bill.billingPeriodEnd ? new Date(bill.billingPeriodEnd).getTime() : NaN;
  const periodDays =
    !Number.isNaN(start) && !Number.isNaN(end) && end > start
      ? (end - start) / 86_400_000
      : 0;

  return Math.round(consumption * (periodDays > 0 ? 365 / periodDays : 6));
}

/** Date and time, for the rows where the hour of the upload is the point. */
const fmtDateTime = (val: string | null | undefined) => {
  if (!val) return "—";
  try {
    const d = new Date(val);
    return `${fmtDateIt(val)} ${d.toLocaleTimeString(getLocale(), {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return val;
  }
};

/**
 * The order the cards read in until an admin rearranges them, and what the
 * "Reset layout" button puts back. Arrived at by the admins arranging the
 * screen themselves; an admin who drags a card still overrides it, and theirs
 * wins on every later visit.
 */
const DEFAULT_CARD_ORDER = [
  "customer",
  "addresses",
  "utility",
  "offer",
  "bill_ocr",
  "case",
  "documents",
  "payment",
] as const;

type CardKey = (typeof DEFAULT_CARD_ORDER)[number];

/**
 * Where an admin's own arrangement is kept.
 *
 * The order is a personal reading preference rather than anything about the
 * case — two admins on the same case may each want their own — so it lives in
 * the browser and never reaches the server.
 */
const CARD_ORDER_STORAGE_KEY = "vyzi:case-overview-card-order";

/**
 * The saved arrangement, reconciled with the cards that exist today.
 *
 * Keys that no longer name a card are dropped and cards added since the order
 * was saved are appended, so releasing a new card never hides it from an admin
 * who arranged the screen before it existed.
 */
function readStoredCardOrder(): CardKey[] {
  try {
    const raw = localStorage.getItem(CARD_ORDER_STORAGE_KEY);
    if (!raw) return [...DEFAULT_CARD_ORDER];
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return [...DEFAULT_CARD_ORDER];
    const known = [
      ...new Set(
        stored.filter((key): key is CardKey =>
          (DEFAULT_CARD_ORDER as readonly string[]).includes(key as string),
        ),
      ),
    ];
    return [...known, ...DEFAULT_CARD_ORDER.filter((key) => !known.includes(key))];
  } catch {
    // A browser that refuses storage, or a value some other tab corrupted —
    // either way the default order is a perfectly good screen.
    return [...DEFAULT_CARD_ORDER];
  }
}

/** What a card needs in order to be picked up and dropped onto. */
type CardDragState = {
  draggingKey: CardKey | null;
  overKey: CardKey | null;
  /** Where the card sits in the arrangement, 1-based. */
  positionOf: (key: CardKey) => number;
  total: number;
  onDragStart: (key: CardKey) => void;
  onDragEnd: () => void;
  /** The card the one in flight would land on, or null once it leaves the grid. */
  onDragOverCard: (key: CardKey | null) => void;
  onDropOnCard: (key: CardKey) => void;
  /** Keyboard equivalent — moves the card by one place in either direction. */
  onNudge: (key: CardKey, delta: number) => void;
};

/**
 * One numbered card, which the admin can drag into the place they want it.
 *
 * The drag starts from the handle rather than the card, so selecting a value
 * to copy — an IBAN, a POD — still works everywhere inside it. The card itself
 * only receives the drop, and marks the edge the card in flight would land on.
 */
function OverviewCard({
  cardKey,
  title,
  drag,
  children,
}: {
  cardKey: CardKey;
  title: string;
  drag: CardDragState;
  children: React.ReactNode;
}) {
  useTranslation();
  const position = drag.positionOf(cardKey);
  const isDropTarget = drag.overKey === cardKey && drag.draggingKey !== cardKey;
  // Dragged forward, the card lands after the one it was dropped on; dragged
  // back, before it. An inset bar rather than a border, so marking the target
  // does not shift the grid by the width of it.
  const landsAfter =
    isDropTarget && drag.draggingKey != null && position > drag.positionOf(drag.draggingKey);

  return (
    <div
      data-card={cardKey}
      onDragOver={(event) => {
        if (!drag.draggingKey) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        drag.onDragOverCard(cardKey);
      }}
      onDrop={(event) => {
        if (!drag.draggingKey) return;
        event.preventDefault();
        drag.onDropOnCard(cardKey);
      }}
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
        drag.draggingKey === cardKey && "opacity-40",
        isDropTarget &&
          (landsAfter
            ? "shadow-[inset_-3px_0_0_0_#7061ED]"
            : "shadow-[inset_3px_0_0_0_#7061ED]"),
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[#7061ED] text-[11px] font-bold text-white">
          {position}
        </span>
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        <Tooltip title={i18n.t("audit.drag_to_rearrange_the_cards_or_focus_this_handle_and_use")}>
          <span
            data-card-handle={cardKey}
            role="button"
            aria-label={i18n.t("audit.reorder_card", { title, position, total: drag.total })}
            tabIndex={0}
            draggable
            onDragStart={(event) => {
              const card = event.currentTarget.closest<HTMLElement>("[data-card]");
              // Without this the ghost following the cursor is the handle
              // alone, and there is no telling which card is in flight.
              if (card) event.dataTransfer.setDragImage(card, 24, 24);
              event.dataTransfer.effectAllowed = "move";
              // Firefox refuses to start a drag that carries no data.
              event.dataTransfer.setData("text/plain", cardKey);
              drag.onDragStart(cardKey);
            }}
            onDragEnd={drag.onDragEnd}
            onKeyDown={(event) => {
              const delta =
                event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : 0;
              if (!delta) return;
              event.preventDefault();
              drag.onNudge(cardKey, delta);
            }}
            className="ml-auto flex cursor-grab items-center rounded text-slate-300 outline-none transition-colors hover:text-[#7061ED] focus-visible:ring-2 focus-visible:ring-violet-400 active:cursor-grabbing"
          >
            <LuGripVertical className="h-4 w-4" />
          </span>
        </Tooltip>
      </div>
      {children}
    </div>
  );
}

/** Label left, value right — the shape all but the address and document cards take. */
function CardRows({ rows }: { rows: DataRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) =>
        r.stacked ? (
          <div key={r.label}>
            <span className="text-xs leading-snug text-slate-400">{r.label}</span>
            <div className="mt-1 text-sm font-medium text-slate-700">{r.value}</div>
          </div>
        ) : (
          <div key={r.label} className="flex items-start justify-between gap-3">
            <span className="w-[44%] shrink-0 text-xs leading-snug text-slate-400">
              {r.label}
            </span>
            <span
              className={`min-w-0 break-words text-right text-sm font-medium text-slate-700 ${
                r.cap ? "capitalize" : ""
              }`}
            >
              {r.value}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

/** One address on the Addresses card: icon, what it is, then the line itself. */
function AddressBlock({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        <p className="mt-1 break-words text-sm text-slate-500">{value}</p>
        {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
      </div>
    </div>
  );
}

/** A file the admin can pull down, wherever the API keeps it. */
type OverviewFile = {
  id: string;
  /** What this file is — the label the row is filed under. */
  group: string;
  name: string;
  uploadedAt: string;
  /** Authenticated endpoint the bytes come from. */
  url: string;
  /** Only identity documents carry a verification state; bill files do not. */
  verified?: boolean;
};

function FileRow({
  file,
  onDownload,
  busy,
}: {
  file: OverviewFile;
  onDownload: (file: OverviewFile) => void;
  busy: boolean;
}) {
  useTranslation();
  return (
    <div>
      <span className="text-xs leading-snug text-slate-400">{file.group}</span>
      <div className="mt-0.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDownload(file)}
          disabled={busy}
          title={file.name}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800 disabled:opacity-50"
        >
          <FiFileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{file.name}</span>
        </button>
        <span className="shrink-0 text-xs text-slate-400">{fmtDateIt(file.uploadedAt)}</span>
        {file.verified != null && (
          <span
            title={file.verified ? i18n.t("audit.file_verified") : i18n.t("audit.file_awaiting_verification")}
            className={file.verified ? "text-emerald-500" : "text-amber-500"}
          >
            {file.verified ? (
              <FiCheckCircle className="h-3.5 w-3.5" />
            ) : (
              <LuClock3 className="h-3.5 w-3.5" />
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => onDownload(file)}
          disabled={busy}
          title={i18n.t("case_management.download")}
          className="shrink-0 text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-50"
        >
          <LuDownload className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Everything the switch is filed against, on one screen.
 *
 * Laid out as seven numbered cards rather than one long column: an admin
 * checking a case reads across a supplier's requirements — who the customer is,
 * where the supply is, what the meter says, what the bill said, how it is paid
 * for, what they signed, what was uploaded — and a card per question lets them
 * find one without scrolling past the other six.
 */
function CaseDataSection({
  caseData,
  bill,
  customerName,
}: {
  caseData: ICase;
  /** The full bill the case was opened from — the case's own copy is a subset. */
  bill: IBill;
  customerName: string;
}) {
  useTranslation();
  const token = useAppSelector((state) => state.auth.token);
  const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");
  const [editing, setEditing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [cardOrder, setCardOrder] = useState<CardKey[]>(readStoredCardOrder);
  const [draggingKey, setDraggingKey] = useState<CardKey | null>(null);
  const [overKey, setOverKey] = useState<CardKey | null>(null);

  const isCustomOrder = cardOrder.some((key, i) => key !== DEFAULT_CARD_ORDER[i]);

  /**
   * Lifts a card out of the arrangement and puts it back at `toIndex`, saving
   * the result. A browser refusing storage still rearranges the screen for the
   * rest of the visit — the preference simply does not outlive it.
   */
  const moveCard = (key: CardKey, toIndex: number) => {
    const from = cardOrder.indexOf(key);
    const to = Math.max(0, Math.min(cardOrder.length - 1, toIndex));
    if (from === -1 || from === to) return;
    const next = [...cardOrder];
    next.splice(from, 1);
    next.splice(to, 0, key);
    setCardOrder(next);
    try {
      localStorage.setItem(CARD_ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* nothing saved — the arrangement still holds for this visit */
    }
  };

  const resetCardOrder = () => {
    setCardOrder([...DEFAULT_CARD_ORDER]);
    try {
      localStorage.removeItem(CARD_ORDER_STORAGE_KEY);
    } catch {
      /* nothing was saved to clear */
    }
  };

  /** Keeps the keyboard on the card it just moved, rather than on the place it left. */
  const refocusHandle = (key: CardKey) => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-card-handle="${key}"]`)?.focus();
    });
  };

  const cardDrag: CardDragState = {
    draggingKey,
    overKey,
    positionOf: (key) => cardOrder.indexOf(key) + 1,
    total: cardOrder.length,
    onDragStart: setDraggingKey,
    onDragEnd: () => {
      setDraggingKey(null);
      setOverKey(null);
    },
    onDragOverCard: (key) => setOverKey((current) => (current === key ? current : key)),
    onDropOnCard: (key) => {
      if (draggingKey) moveCard(draggingKey, cardOrder.indexOf(key));
      setDraggingKey(null);
      setOverKey(null);
    },
    onNudge: (key, delta) => {
      moveCard(key, cardOrder.indexOf(key) + delta);
      refocusHandle(key);
    },
  };

  const isElectricity = bill.billType === "electricity";
  const unit = isElectricity ? "kWh" : "Smc";

  const supply: CaseAddress = {
    street: caseData.supplyStreet,
    streetNumber: caseData.supplyStreetNumber,
    city: caseData.supplyCity,
    postalCode: caseData.supplyPostalCode,
    province: caseData.supplyProvince,
  };
  const residential: CaseAddress = {
    street: caseData.residentialStreet,
    streetNumber: caseData.residentialStreetNumber,
    city: caseData.residentialCity,
    postalCode: caseData.residentialPostalCode,
    province: caseData.residentialProvince,
  };
  const shipping: CaseAddress = {
    street: caseData.shippingStreet,
    streetNumber: caseData.shippingStreetNumber,
    city: caseData.shippingCity,
    postalCode: caseData.shippingPostalCode,
    province: caseData.shippingProvince,
  };

  // Cases opened before the structured address fields existed only carry the
  // OCR'd supply line on the bill — fall back to it so the row is never blank.
  const supplyLine = fmtAddress(supply);
  const supplyDisplay = supplyLine !== "—" ? supplyLine : dash(bill.supplyAddress);

  // What is stored wins. The flag is only the fallback, for cases saved before
  // a block declared identical to the supply address was kept as a copy of it.
  const resolveAddress = (address: CaseAddress, sameAsSupply: boolean): string => {
    const line = fmtAddress(address);
    if (line !== "—") return line;
    return sameAsSupply ? supplyDisplay : "—";
  };

  // A company has a registered office and no residence: same columns, and the
  // only honest word for what is in them depends on who filed the case.
  const isBusinessCase =
    caseData.user?.role === "business" || !!caseData.user?.businessProfile;

  const residentialDisplay = resolveAddress(residential, caseData.residentialSameAsSupply);
  const shippingDisplay = resolveAddress(shipping, caseData.shippingSameAsSupply);

  // The supplier the customer is leaving is only linked to a supplier record
  // when the OCR'd name matched one, so fall back to the name off the bill.
  const fromSupplier = dash(caseData.fromSupplier?.name || bill.supplierName);

  const isDirectDebit = caseData.paymentMethod === "rid_bancario";
  const isPaper = caseData.invoiceDelivery === "paper";
  const ibanHolder = [caseData.ibanHolderFirstName, caseData.ibanHolderLastName]
    .filter(Boolean)
    .join(" ");

  // The customer's own tax ID, which is what the holder columns held implicitly
  // on cases filed before the app sent them for its own customer.
  const customerTaxId =
    caseData.user?.codiceFiscale ||
    caseData.user?.businessProfile?.partitaIva ||
    bill.codiceFiscale ||
    bill.partitaIva;
  const legacyHolderTaxCode = ibanHolder ? null : customerTaxId;

  const offer = caseData.selectedOffer;
  // Variable and indexed offers quote a spread over the market index rather
  // than a price of their own — the same rule the offers table renders by.
  const offerPrice =
    offer?.marketType === "variable" || offer?.marketType === "indexed"
      ? offer?.spread
      : isElectricity
        ? offer?.pricePerKwh
        : offer?.pricePerSmc;

  const documents = caseData.documents || [];
  const billFiles: IBillFile[] = bill.files ?? [];

  const files: OverviewFile[] = [
    ...billFiles.map((bf) => ({
      id: `bill-${bf.id}`,
      group: bf.verificationId ? "Re-uploaded Bill" : "Uploaded Bill",
      name: bf.originalName || bf.fileUrl.split("/").pop() || "bill",
      uploadedAt: bf.createdAt,
      url: `${server_url}bills/${bill.id}/files/${bf.id}`,
    })),
    ...documents.map((doc) => ({
      id: `doc-${doc.id}`,
      group: enumLabel(documentTypeKey, doc.documentType),
      name: doc.fileName,
      uploadedAt: doc.createdAt,
      url: `${server_url}cases/${caseData.id}/documents/${doc.id}/file`,
      verified: doc.verified,
    })),
  ];

  const handleDownload = async (file: OverviewFile) => {
    setDownloadingId(file.id);
    try {
      await downloadAuthedFile(file.url, token, file.name);
    } catch {
      message.error(i18n.t("audit.failed_to_download_file"));
    } finally {
      setDownloadingId(null);
    }
  };

  // The bill the case was opened from, as opposed to anything re-uploaded
  // later during verification — what "the original" means on the OCR card.
  const originalBillFiles = files.filter((f) => f.group === "Uploaded Bill");

  const cards: DataCard[] = [
    {
      key: "customer",
      title: i18n.t("audit.customer_data"),
      rows: [
        { label: i18n.t("settings.first_name"), value: dash(caseData.user?.firstName) },
        { label: i18n.t("settings.last_name"), value: dash(caseData.user?.lastName) },
        {
          // On a business account this is the person signing for the company,
          // not the company — whose number is the VAT row below.
          label: isBusinessCase ? i18n.t("audit.tax_code_signatory") : i18n.t("audit.tax_code"),
          value: dash(caseData.user?.codiceFiscale || bill.codiceFiscale),
        },
        // The account's own VAT number where there is one; the bill's OCR'd
        // value is the fallback, since a business account holds it on its
        // profile rather than on the user row. Absent entirely for a private
        // customer, who has no VAT number to be missing.
        ...(caseData.user?.businessProfile?.partitaIva || bill.partitaIva
          ? [
              {
                label: i18n.t("audit.vat_number"),
                value: (caseData.user?.businessProfile?.partitaIva || bill.partitaIva) as string,
              },
            ]
          : []),
        // The address the account signs in with.
        { label: "Email", value: dash(caseData.user?.email) },
        // And the one the company is reached at legally, which is a different
        // address: the mailbox that registered a company account is very often
        // somebody's personal one, and an invoice does not belong there.
        ...(isBusinessCase
          ? [
              {
                label: "PEC",
                value: dash(caseData.user?.businessProfile?.pecEmail),
              },
            ]
          : []),
        { label: i18n.t("client_management.phone"), value: dash(caseData.user?.phone) },
      ],
    },
    {
      key: "addresses",
      title: i18n.t("audit.addresses"),
      content: (
        <div className="space-y-4">
          <AddressBlock
            icon={<LuBuilding2 className="h-3.5 w-3.5" />}
            label={i18n.t("ocr.supply_address")}
            value={supplyDisplay}
          />
          <AddressBlock
            icon={<LuHouse className="h-3.5 w-3.5" />}
            label={isBusinessCase ? i18n.t("audit.registered_office") : i18n.t("audit.residential_address")}
            value={residentialDisplay}
            note={caseData.residentialSameAsSupply ? i18n.t("audit.same_as_supply_address") : undefined}
          />
          <AddressBlock
            icon={<LuMail className="h-3.5 w-3.5" />}
            label={i18n.t("audit.billing_shipping_address")}
            // Only paper invoices are posted anywhere, so for a digital case
            // there is no shipping address to be missing.
            value={isPaper ? shippingDisplay : "Digital invoices — nothing is posted"}
            note={isPaper && caseData.shippingSameAsSupply ? i18n.t("audit.same_as_supply_address") : undefined}
          />
        </div>
      ),
    },
    {
      key: "utility",
      title: i18n.t("audit.utility_consumption"),
      rows: [
        {
          label: i18n.t("service_types.utility_type"),
          value: (
            <Tag
              color={isElectricity ? "blue" : "orange"}
              className="m-0! rounded-md! border-0! px-2! py-0! text-xs! font-semibold!"
            >
              <span className="flex items-center gap-1">
                {isElectricity ? <LuZap className="h-2.5 w-2.5" /> : <LuFlame className="h-2.5 w-2.5" />}
                {i18n.t(isElectricity ? "home.electricity" : "home.gas")}
              </span>
            </Tag>
          ),
        },
        { label: "POD / PDR", value: dash(bill.podNumber || bill.pdrNumber) },
        { label: i18n.t("audit.current_supplier"), value: fromSupplier },
        { label: i18n.t("audit.meter_number"), value: dash(bill.meterNumber) },
        { label: i18n.t("audit.contract_number"), value: dash(bill.contractNumber) },
        {
          label: i18n.t("audit.annual_consumption_est"),
          value: formatQuantity(annualConsumption(bill), unit),
        },
      ],
    },
    {
      key: "payment",
      title: i18n.t("audit.payment_billing"),
      rows: [
        {
          label: i18n.t("client_management.payment_method"),
          value: caseData.paymentMethod
            ? enumLabel(paymentMethodKey, caseData.paymentMethod)
            : "—",
        },
        // A postal order has no account behind it, so there is no holder to
        // describe. Under direct debit the whole block always shows, including
        // when the account is the customer's own — the mandate is filed against
        // these values whoever they belong to.
        ...(isDirectDebit
          ? [
              // 27 unbroken characters — the one value with no space in it
              // long enough to need the width of the whole card.
              { label: "IBAN", value: dash(caseData.iban), stacked: true },
              {
                label: i18n.t("audit.account_holder"),
                // Cases filed before the app sent the holder for its own
                // customer have the columns empty; the contract holder is who
                // it was, so name them rather than showing a dash.
                value: ibanHolder || customerName,
              },
              {
                label: i18n.t("audit.holder_tax_code_vat"),
                value: dash(caseData.ibanHolderTaxCode || legacyHolderTaxCode),
              },
              {
                label: i18n.t("audit.iban_holder_matches_contract_holder"),
                // Whether the mandate needs a second signature turns on this,
                // so an unasked question is reported as unasked rather than
                // answered "No".
                value:
                  caseData.ibanSameAsContract == null ? (
                    <Tag className="m-0! rounded-md! border-0! bg-slate-100! px-2! py-0! text-xs! font-semibold! text-slate-500!">
                      {i18n.t("audit.not_recorded")}
                    </Tag>
                  ) : caseData.ibanSameAsContract ? (
                    <Tag color="green" className="m-0! rounded-md! border-0! px-2! py-0! text-xs! font-semibold!">
                      {i18n.t("common.yes")}
                    </Tag>
                  ) : (
                    <Tag color="orange" className="m-0! rounded-md! border-0! px-2! py-0! text-xs! font-semibold!">
                      {i18n.t("audit.no_third_party")}
                    </Tag>
                  ),
              },
            ]
          : []),
        {
          label: i18n.t("audit.invoice_delivery_method"),
          value: caseData.invoiceDelivery
            ? enumLabel(invoiceDeliveryKey, caseData.invoiceDelivery)
            : "—",
        },
        ...(caseData.invoiceDelivery === "digital"
          ? [
              {
                label: i18n.t("audit.invoice_email"),
                value: dash(caseData.invoiceEmail || caseData.user?.email),
              },
            ]
          : []),
      ],
    },
    {
      key: "bill_ocr",
      title: i18n.t("audit.bill_data_ocr"),
      rows: [
        {
          label: i18n.t("audit.bill_period"),
          value:
            bill.billingPeriodStart || bill.billingPeriodEnd
              ? `${fmtDateIt(bill.billingPeriodStart)} — ${fmtDateIt(bill.billingPeriodEnd)}`
              : "—",
        },
        { label: i18n.t("audit.upload_date"), value: fmtDateTime(bill.createdAt) },
        { label: i18n.t("audit.total_bill_amount"), value: formatMoney(bill.totalAmount) },
        {
          label: i18n.t("audit.period_consumption"),
          value: formatQuantity(isElectricity ? bill.consumptionKwh : bill.consumptionSmc, unit),
        },
        { label: i18n.t("ocr.cost_per_unit"), value: formatUnitPrice(bill.costPerUnit, unit) },
        { label: i18n.t("ocr.fixed_charges"), value: formatMoney(bill.fixedCharges) },
        { label: i18n.t("ocr.taxes"), value: formatMoney(bill.taxes) },
        {
          label: i18n.t("audit.detected_supplier"),
          value: dash(
            bill.supplierName ||
              bill.supplier?.name ||
              (bill.rawAnalysisData?.ocrSupplierName as string),
          ),
        },
        { label: i18n.t("audit.detected_supply_address"), value: dash(bill.supplyAddress) },
        {
          label: originalBillFiles.length > 1 ? i18n.t("audit.original_uploaded_files") : i18n.t("audit.original_uploaded_file"),
          stacked: true,
          value:
            originalBillFiles.length > 0 ? (
              <div className="space-y-1">
                {originalBillFiles.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleDownload(f)}
                    disabled={downloadingId === f.id}
                    title={f.name}
                    className="flex w-full items-center gap-1.5 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800 disabled:opacity-50"
                  >
                    <FiFileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{f.name}</span>
                    <LuDownload className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            ) : bill.fileUrl ? (
              // Bills stored before the files table existed carry the upload
              // on the bill row itself, where there is no endpoint to fetch it.
              <span className="text-slate-400">{i18n.t("audit.1_file_legacy")}</span>
            ) : (
              "—"
            ),
        },
      ],
    },
    {
      key: "offer",
      title: i18n.t("audit.offer_contract"),
      rows: [
        {
          label: i18n.t("audit.selected_supplier"),
          value: dash(caseData.toSupplier?.name || offer?.supplier?.name),
        },
        { label: i18n.t("offers_market.offer_name"), value: dash(offer?.name) },
        // Supplier tariff codes run long and carry no spaces to break at.
        { label: i18n.t("offers_market.offer_code"), value: dash(offer?.offerCode), stacked: true },
        { label: i18n.t("audit.price_type"), value: dash(offer?.marketType), cap: true },
        {
          label: offer?.marketType === "fixed" ? i18n.t("audit.energy_price") : i18n.t("offers_market.spread"),
          value: formatUnitPrice(offerPrice, unit),
        },
        {
          label: i18n.t("audit.fixed_energy_costs"),
          value:
            offer?.fixedMonthlyFee == null
              ? "—"
              : `${formatMoney(offer.fixedMonthlyFee)} / month`,
        },
        {
          label: i18n.t("audit.duration_2"),
          value: formatContractDuration(offer),
        },
        { label: i18n.t("home.estimated_annual_value"), value: formatMoney(caseData.estimatedAnnualValue) },
        { label: i18n.t("audit.predicted_activation_date"), value: fmtDateIt(caseData.activationDate) },
      ],
    },
    {
      key: "documents",
      title: i18n.t("faq_management.category_documents"),
      content:
        files.length === 0 ? (
          <p className="text-xs text-slate-400">{i18n.t("audit.nothing_uploaded_on_this_case_yet")}</p>
        ) : (
          <div className="space-y-3">
            {files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                onDownload={handleDownload}
                busy={downloadingId === f.id}
              />
            ))}
          </div>
        ),
    },
    {
      key: "case",
      title: i18n.t("audit.case_handling"),
      rows: [
        { label: i18n.t("audit.case_number"), value: dash(caseData.caseNumber) },
        { label: i18n.t("audit.case_type"), value: dash(caseData.caseType?.replace("_", " ")), cap: true },
        { label: i18n.t("support_ticket.priority"), value: dash(caseData.priority), cap: true },
        {
          label: i18n.t("support_ticket.assigned_agent"),
          // Named rather than dashed when nobody holds it: an unassigned case
          // is a state someone has to act on, not a value that is missing.
          value: caseData.assignedAgent
            ? `${caseData.assignedAgent.firstName} ${caseData.assignedAgent.lastName}`.trim() ||
              caseData.assignedAgent.email
            : "Unassigned",
        },
        { label: i18n.t("audit.sla_deadline"), value: fmtDateIt(caseData.slaDeadline) },
        {
          label: i18n.t("audit.sla_days"),
          value: caseData.slaDaysTotal == null ? "—" : i18n.t("audit.days_count", { count: caseData.slaDaysTotal }),
        },
        { label: i18n.t("audit.contract_sent_on"), value: fmtDateIt(caseData.contractSentAt) },
        { label: i18n.t("audit.expiry_date_2"), value: fmtDateIt(caseData.expiryDate) },
        { label: i18n.t("audit.created_at"), value: fmtDateIt(caseData.createdAt) },
        { label: i18n.t("service_types.last_updated"), value: fmtDateIt(caseData.updatedAt) },
      ],
    },
  ];

  // The cards as this admin arranged them. `cardOrder` is reconciled against
  // the cards that exist, so every key in it resolves to one.
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const orderedCards = cardOrder.flatMap((key) => {
    const card = byKey.get(key);
    return card ? [card] : [];
  });

  return (
    <div className="space-y-5">
      {/* One button for the whole tab: every field below is corrected in the
          same modal, so the admin never has to guess which card owns one. */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{i18n.t("audit.case_overview")}</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {i18n.t("audit.everything_the_switch_is_filed_against_and_every_field_of_it_is_corrected_in_one_modal_the_supply_point_read_off_the_bill_and_the_customer_s_own_record_included_saved_back_to_the_bill_and_the_account_behind_the_scenes_only_the_offer_s_tariff_terms_are_read_only_they_belong_to_the_offer_and_editing_a_copy_of_them_here_would_let_the_two_drift_apart_drag_a_card_by_its_handle_to_put_it_where_you_want_it_the_arrangement_is_remembered_on_this_browser")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isCustomOrder && (
            <Button size="small" icon={<LuRotateCcw className="h-3 w-3" />} onClick={resetCardOrder}>
              {i18n.t("audit.reset_layout")}
            </Button>
          )}
          <Button
            type="primary"
            size="small"
            icon={<FiEdit2 className="h-3 w-3" />}
            onClick={() => setEditing(true)}
          >
            {i18n.t("audit.edit_case_data")}
          </Button>
        </div>
      </div>

      {/* Cards keep their own height and line up at the top, so a short card
          next to the OCR one does not stretch to match it. */}
      <div
        // Three across rather than four: at the 14px the rest of the dashboard
        // sets its values in, a quarter-width card is too narrow for a label
        // and a value on one line, and every identifier breaks mid-token.
        className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3"
        // Dropping in the gaps between cards would otherwise leave the marked
        // card highlighted with nothing having moved.
        onDragOver={(event) => {
          if (!draggingKey) return;
          event.preventDefault();
          // Only when the cursor is in the gaps: an event bubbling up from a
          // card has already marked that card as the target.
          if (event.target === event.currentTarget) setOverKey(null);
        }}
        onDrop={() => {
          setDraggingKey(null);
          setOverKey(null);
        }}
      >
        {orderedCards.map((card) => (
          <OverviewCard key={card.key} cardKey={card.key} title={card.title} drag={cardDrag}>
            {card.content ?? <CardRows rows={card.rows ?? []} />}
          </OverviewCard>
        ))}
      </div>

      {/* The bill goes in too: the supply point the switch is filed against is
          bill data, and an admin correcting a POD should not have to find out
          which tab owns it. */}
      <EditCaseModal
        caseData={caseData}
        bill={bill}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}

/** The reasons an admin can give for turning a document down, in the order offered. */
const REJECTION_REASONS: DocumentRejectionReason[] = [
  "expired",
  "unreadable",
  "incomplete",
  "wrong_document",
  "other",
];

function CaseDocumentsSection({ documents, caseId }: { documents: ICaseDocument[]; caseId: string }) {
  useTranslation();
  const token = useAppSelector((state) => state.auth.token);
  const [verifyDocument] = useVerifyDocumentMutation();
  const [rejectDocument, { isLoading: isRejecting }] = useRejectDocumentMutation();
  // Per document, so ruling on one does not spin every button in the list.
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ICaseDocument | null>(null);
  const [rejectReason, setRejectReason] = useState<DocumentRejectionReason | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [uploadCaseDocument] = useUploadCaseDocumentMutation();
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<ICaseDocument | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fetchDocBlob = useCallback(async (doc: ICaseDocument) => {
    const url = `${server_url}cases/${caseId}/documents/${doc.id}/file`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.blob();
  }, [caseId, token]);

  const handleView = async (doc: ICaseDocument) => {
    setLoadingId(doc.id);
    try {
      const blob = await fetchDocBlob(doc);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewDoc(doc);
      setPreviewOpen(true);
    } catch {
      message.error(i18n.t("case_management.load_document_failed"));
    } finally {
      setLoadingId(null);
    }
  };

  const handleDownload = async (doc: ICaseDocument) => {
    try {
      await downloadAuthedFile(
        `${server_url}cases/${caseId}/documents/${doc.id}/file`,
        token,
        doc.fileName,
      );
    } catch {
      message.error(i18n.t("case_management.download_document_failed"));
    }
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewDoc(null);
  };

  const handleVerify = async (docId: string) => {
    setActingId(docId);
    try {
      await verifyDocument({ caseId, docId }).unwrap();
      message.success(i18n.t("audit.document_verified"));
    } catch (err) {
      message.error(getApiErrorMessage(err, i18n.t("audit.failed_to_verify_document")));
    } finally {
      setActingId(null);
    }
  };

  const openReject = (doc: ICaseDocument) => {
    setRejecting(doc);
    setRejectReason(null);
    setRejectNote("");
  };

  const closeReject = () => setRejecting(null);

  // "Other" says nothing on its own, so the customer is only told it with the
  // admin's own words beside it — the server enforces the same.
  const noteRequired = rejectReason === "other";
  const canReject = !!rejectReason && (!noteRequired || rejectNote.trim().length > 0);

  const handleReject = async () => {
    if (!rejecting || !rejectReason || !canReject) return;
    try {
      await rejectDocument({
        caseId,
        docId: rejecting.id,
        reason: rejectReason,
        note: rejectNote.trim() || undefined,
      }).unwrap();
      message.success(i18n.t("audit.document_rejected"));
      closeReject();
    } catch (err) {
      message.error(getApiErrorMessage(err, i18n.t("audit.failed_to_reject_document")));
    }
  };

  const handleMultiUpload = async (fileList: File[]) => {
    setUploading(true);
    let successCount = 0;
    // The last reason a file was refused (too large, wrong type...), so a
    // total failure can say why instead of only that it failed.
    let lastError: unknown;
    for (const file of fileList) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${server_origin}/api/v1/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const result = await res.json();
        const url = result?.data?.url || result?.url;
        if (res.ok && url) {
          await uploadCaseDocument({
            caseId,
            documentType: "identity_document",
            fileUrl: url,
            fileName: file.name,
          }).unwrap();
          successCount++;
        } else {
          lastError = { status: res.status, data: result };
        }
      } catch (err) {
        // continue with remaining files
        lastError = err;
      }
    }
    setUploading(false);
    if (successCount > 0) {
      message.success(i18n.t("audit.documents_uploaded", { count: successCount }));
    } else {
      message.error(getApiErrorMessage(lastError, i18n.t("audit.failed_to_upload_documents")));
    }
  };

  const isPdf = (doc: ICaseDocument) => doc.mimeType === "application/pdf" || doc.fileName.endsWith(".pdf");
  const isImage = (doc: ICaseDocument) => doc.mimeType?.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(doc.fileName);

  // A rejected document the customer has since replaced is history: the
  // replacement is what is under review now, so the old one counts for nothing.
  const replacedIds = new Set(
    documents.map((d) => d.replacesDocumentId).filter((id): id is string => !!id),
  );
  const byId = new Map(documents.map((d) => [d.id, d]));
  const activeDocs = documents.filter((d) => !replacedIds.has(d.id));
  const awaitingReplacement = activeDocs.some((d) => !!d.rejectedAt);
  const allVerified = activeDocs.length > 0 && activeDocs.every((d) => d.verified);
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString(getLocale(), { month: "2-digit", day: "2-digit", year: "numeric" });

  const renderDocRow = (doc: ICaseDocument) => {
    const replaced = replacedIds.has(doc.id);
    const rejected = !!doc.rejectedAt && !replaced;
    const original = doc.replacesDocumentId ? byId.get(doc.replacesDocumentId) : undefined;
    const tone = replaced
      ? "bg-slate-100 text-slate-400"
      : rejected
        ? "bg-red-50 text-red-500"
        : doc.verified
          ? "bg-emerald-50 text-emerald-500"
          : "bg-amber-50 text-amber-500";

    return (
    <div
      key={doc.id}
      className={`flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:bg-slate-50/50 ${rejected ? "border-red-100" : "border-slate-100"} ${replaced ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <FiFileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700 truncate">{doc.fileName}</p>
          {doc.verified && doc.verifiedAt && (
            <p className="text-[10px] text-emerald-500 mt-0.5">
              {i18n.t("audit.verified_on")} {fmtDay(doc.verifiedAt)}
            </p>
          )}
          {doc.rejectedAt && doc.rejectionReason && (
            <p className={`text-xs mt-0.5 ${replaced ? "text-slate-400" : "text-red-500"}`}>
              {i18n.t("audit.rejected_on", { date: fmtDay(doc.rejectedAt) })}
              {" · "}
              {i18n.t(`audit.rejection_reason_${doc.rejectionReason}`)}
              {doc.rejectionNote ? ` — ${doc.rejectionNote}` : ""}
            </p>
          )}
          {rejected && (
            <p className="text-[10px] text-slate-400 mt-0.5">{i18n.t("audit.waiting_for_replacement")}</p>
          )}
          {doc.replacesDocumentId && (
            <p className="text-[10px] text-indigo-500 mt-0.5">
              {i18n.t("audit.replaces_document", { name: original?.fileName ?? "—" })}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleView(doc)}
          disabled={loadingId === doc.id}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
        >
          <FiEye className="h-3.5 w-3.5" />
          {loadingId === doc.id ? "..." : i18n.t("audit.view")}
        </button>
        <button
          type="button"
          onClick={() => handleDownload(doc)}
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-800 transition-colors"
        >
          <FiDownload className="h-3.5 w-3.5" />
          {i18n.t("case_management.download")}
        </button>
        {replaced ? (
          <Tag className="m-0! rounded-full! border-0! text-xs!">{i18n.t("audit.document_replaced")}</Tag>
        ) : (
          <>
            {doc.verified ? (
              <Tag color="green" className="m-0! rounded-full! border-0! text-xs!">
                {i18n.t("case_management.status.verified")}
              </Tag>
            ) : (
              <>
                {rejected && (
                  <Tag color="red" className="m-0! rounded-full! border-0! text-xs!">
                    {i18n.t("audit.document_rejected_tag")}
                  </Tag>
                )}
                <Button
                  size="small"
                  type="primary"
                  loading={actingId === doc.id}
                  onClick={() => handleVerify(doc.id)}
                  className="h-7 rounded-lg bg-emerald-500! hover:bg-emerald-600! border-0! text-xs! font-semibold!"
                  icon={<FiCheck className="h-3 w-3" />}
                >
                  {i18n.t("dashboard.verify")}
                </Button>
              </>
            )}
            {!rejected && (
              <Button
                size="small"
                danger
                disabled={actingId === doc.id}
                onClick={() => openReject(doc)}
                className="h-7 rounded-lg text-xs! font-semibold!"
                icon={<FiX className="h-3 w-3" />}
              >
                {i18n.t("audit.reject_request_new")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Identity Verification Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-800">{i18n.t("audit.identity_verification")}</h4>
              <Tag
                color={activeDocs.length === 0 || awaitingReplacement ? "red" : allVerified ? "green" : "orange"}
                className="m-0! rounded-full! border-0! text-xs! font-semibold!"
              >
                {activeDocs.length === 0
                  ? i18n.t("audit.identity_not_uploaded")
                  : awaitingReplacement
                    ? i18n.t("audit.identity_replacement_requested")
                    : allVerified
                      ? i18n.t("audit.identity_verified")
                      : i18n.t("audit.identity_pending_review")}
              </Tag>
            </div>
            {activeDocs.length > 0 && (
              <span className="text-xs text-slate-400">
                {i18n.t("audit.verified_count", {
                  verified: activeDocs.filter((d) => d.verified).length,
                  total: activeDocs.length,
                })}
              </span>
            )}
          </div>

          {documents.length > 0 && (
            <div className="space-y-3 mb-4">
              {documents.map((doc) => renderDocRow(doc))}
            </div>
          )}

          {/* Admin Upload Identity Documents */}
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Upload
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                multiple
                showUploadList={false}
                beforeUpload={(_file, fileList) => {
                  handleMultiUpload(fileList as unknown as File[]);
                  return false;
                }}
              >
                <Button
                  icon={<LuUpload className="h-4 w-4" />}
                  loading={uploading}
                  className="h-8 rounded-lg text-xs!"
                >
                  {i18n.t("audit.upload_identity_documents")}
                </Button>
              </Upload>
              <span className="text-xs text-slate-400">{i18n.t("audit.pdf_jpg_png_webp_select_multiple_files")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reject / request a new document */}
      <Modal
        open={!!rejecting}
        onCancel={closeReject}
        onOk={handleReject}
        okText={i18n.t("audit.reject_and_notify")}
        okButtonProps={{ danger: true, disabled: !canReject }}
        confirmLoading={isRejecting}
        title={i18n.t("audit.reject_document_title")}
        destroyOnClose
      >
        <p className="text-sm text-slate-500 mb-4">
          {i18n.t("audit.reject_document_help", { name: rejecting?.fileName ?? "" })}
        </p>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {i18n.t("audit.rejection_reason")}
        </label>
        <Select
          className="w-full mb-4"
          value={rejectReason ?? undefined}
          onChange={(v: DocumentRejectionReason) => setRejectReason(v)}
          placeholder={i18n.t("audit.select_rejection_reason")}
          options={REJECTION_REASONS.map((r) => ({
            value: r,
            label: i18n.t(`audit.rejection_reason_${r}`),
          }))}
        />
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {noteRequired ? i18n.t("audit.rejection_note_required") : i18n.t("audit.rejection_note_optional")}
        </label>
        <Input.TextArea
          rows={3}
          maxLength={1000}
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          placeholder={i18n.t("audit.rejection_note_placeholder")}
          status={noteRequired && rejectNote.trim().length === 0 ? "warning" : undefined}
        />
        <p className="text-xs text-slate-400 mt-2">{i18n.t("audit.rejection_customer_notified")}</p>
      </Modal>

      {/* Document Preview Modal */}
      <Modal
        open={previewOpen}
        onCancel={handleClosePreview}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={handleClosePreview}>{i18n.t("case_management.close")}</Button>
            {previewDoc && (
              <Button
                type="primary"
                icon={<FiDownload className="h-3.5 w-3.5" />}
                onClick={() => handleDownload(previewDoc)}
                className="bg-emerald-500! hover:bg-emerald-600! border-0!"
              >
                {i18n.t("case_management.download")}
              </Button>
            )}
          </div>
        }
        title={
          <span className="flex items-center gap-2">
            <FiFileText className="h-4 w-4 text-indigo-500" />
            {previewDoc?.fileName || i18n.t("audit.document")}
          </span>
        }
        width={900}
        centered
        destroyOnClose
      >
        {previewUrl && previewDoc && (
          <div className="flex items-center justify-center bg-slate-50 rounded-lg overflow-hidden" style={{ minHeight: 500 }}>
            {isPdf(previewDoc) ? (
              <iframe
                src={previewUrl}
                title={i18n.t("case_management.document_preview")}
                className="w-full border-0 rounded-lg"
                style={{ height: 600 }}
              />
            ) : isImage(previewDoc) ? (
              <img
                src={previewUrl}
                alt={previewDoc.fileName}
                className="max-w-full max-h-[600px] object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-12">
                <FiFileText className="h-12 w-12 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {i18n.t("audit.preview_not_available_for_this_file_type_please_download_the_file_to_view_it")}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/* ── Case Activation Section ───────────────────────────────── */

/**
 * Everything the case records about the switch itself.
 *
 * Contracts are signed with the supplier, outside this application, so there is
 * no document to send, review or store here — only the two dates the supplier
 * confirmed, which the customer sees on their utility. They stay editable
 * because suppliers move activation dates around.
 */
function CaseActivationSection({
  caseData,
  billStatus,
}: {
  caseData: ICase;
  billStatus: string;
}) {
  useTranslation();
  const { message } = App.useApp();
  const [updateCase, { isLoading: isSaving }] = useUpdateCaseMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [activationDate, setActivationDate] = useState<Dayjs | null>(null);
  const [expiryDate, setExpiryDate] = useState<Dayjs | null>(null);

  const isLiveUtility = billStatus === "awaiting_activation" || billStatus === "activated";

  const startEditing = () => {
    setActivationDate(caseData.activationDate ? dayjs(caseData.activationDate) : null);
    setExpiryDate(caseData.expiryDate ? dayjs(caseData.expiryDate) : null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!activationDate || !expiryDate) return;
    try {
      await updateCase({
        id: caseData.id,
        data: {
          activationDate: activationDate.format("YYYY-MM-DD"),
          expiryDate: expiryDate.format("YYYY-MM-DD"),
        },
      }).unwrap();
      message.success(i18n.t("audit.activation_dates_updated"));
      setIsEditing(false);
    } catch (err: any) {
      message.error(getApiErrorMessage(err, i18n.t("audit.dates_save_failed")));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-slate-800">{i18n.t("case_management.steps.activation")}</h4>
          {isLiveUtility && !isEditing && (
            <Button size="small" icon={<FiEdit2 className="h-3 w-3" />} onClick={startEditing}>
              {i18n.t("audit.edit_dates")}
            </Button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">{i18n.t("audit.activation_date")}</label>
                <DatePicker
                  className="w-full"
                  value={activationDate}
                  onChange={(d) => {
                    setActivationDate(d);
                    if (d && expiryDate && !expiryDate.isAfter(d, "day")) setExpiryDate(null);
                  }}
                  format="DD/MM/YYYY"
                  placeholder={i18n.t("audit.select_activation_date")}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">{i18n.t("audit.expiry_date")}</label>
                <DatePicker
                  className="w-full"
                  value={expiryDate}
                  onChange={setExpiryDate}
                  disabledDate={(d) => !!activationDate && !d.isAfter(activationDate, "day")}
                  format="DD/MM/YYYY"
                  placeholder={i18n.t("audit.select_expiry_date")}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="primary"
                loading={isSaving}
                disabled={!activationDate || !expiryDate}
                onClick={handleSave}
              >
                {i18n.t("common.save")}
              </Button>
              <Button onClick={() => setIsEditing(false)}>{i18n.t("common.cancel")}</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <span className="text-xs text-slate-400">{i18n.t("audit.contract_sent_on")}</span>
              <p className="text-sm font-medium text-slate-700">
                {fmtDateIt(caseData.contractSentAt)}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400">{i18n.t("audit.activation_date_2")}</span>
              <p className="text-sm font-medium text-slate-700">
                {fmtDateIt(caseData.activationDate)}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-400">{i18n.t("audit.expiry_date_2")}</span>
              <p className="text-sm font-medium text-slate-700">
                {fmtDateIt(caseData.expiryDate)}
              </p>
            </div>
          </div>
        )}
      </div>

      {billStatus === "contract_sent" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <h4 className="text-sm font-bold text-amber-800">{i18n.t("audit.out_for_signature")}</h4>
          <p className="text-sm text-amber-600 mt-1">
            {i18n.t("audit.the_customer_is_signing_with_the_supplier_nothing_happens_in_the_app_until_the_supplier_confirms_then_move_the_case_to_in_activation_with_the_two_dates_they_gave_you")}
          </p>
        </div>
      )}

      {billStatus === "awaiting_activation" && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
          <h4 className="text-sm font-bold text-blue-800">{i18n.t("audit.switch_in_progress")}</h4>
          <p className="text-sm text-blue-600 mt-1">
            {i18n.t("audit.the_customer_already_sees_this_utility_in_my_utilities_with_the_activation_date_above_mark_it_activated_once_the_supply_is_live")}
          </p>
        </div>
      )}

      {billStatus === "activated" && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <div className="flex items-center gap-2">
            <FiCheckCircle className="h-5 w-5 text-emerald-600" />
            <h4 className="text-sm font-bold text-emerald-800">{i18n.t("audit.utility_active")}</h4>
          </div>
          <p className="text-sm text-emerald-600 mt-1">
            {i18n.t("audit.the_utility_has_been_activated_the_customer_can_see_it_in_their_my_utilities_section")}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Notes Tab ─────────────────────────────────────────── */

function NotesTab({ billId }: { billId: string }) {
  useTranslation();
  const { message } = App.useApp();
  const { data: notes, isLoading } = useGetBillNotesQuery(billId);
  const [addNote, { isLoading: isAdding }] = useAddBillNoteMutation();
  const [updateNote] = useUpdateBillNoteMutation();
  const [deleteNote] = useDeleteBillNoteMutation();
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const handleAdd = async () => {
    if (!content.trim()) return;
    try {
      await addNote({ billId, content: content.trim() }).unwrap();
      message.success(localizedDetail("note_added", "Note added"));
      setContent("");
    } catch {
      message.error(localizedDetail("note_add_failed", "Failed to add note"));
    }
  };

  const handleEdit = (noteId: string, currentContent: string) => {
    setEditingId(noteId);
    setEditContent(currentContent);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    try {
      await updateNote({ billId, noteId: editingId, content: editContent.trim() }).unwrap();
      message.success(localizedDetail("note_updated", "Note updated"));
      setEditingId(null);
      setEditContent("");
    } catch {
      message.error(localizedDetail("note_update_failed", "Failed to update note"));
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await deleteNote({ billId, noteId }).unwrap();
      message.success(localizedDetail("note_deleted", "Note deleted"));
    } catch {
      message.error(localizedDetail("note_delete_failed", "Failed to delete note"));
    }
  };

  return (
    <div className="space-y-5">
      {/* Add note form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-700">{localizedDetail("add_note", "Add note")}</h3>
        <Input.TextArea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={localizedDetail("note_placeholder", "Write a note about this bill...")}
          className="resize-none rounded-xl! border-slate-200"
        />
        <div className="flex justify-end pt-1">
          <Button
            type="primary"
            disabled={!content.trim()}
            onClick={handleAdd}
            loading={isAdding}
            size="middle"
            className="h-10 rounded-lg bg-[#7061ED]! px-5! font-semibold shadow-sm transition-colors hover:bg-[#5f52d4]! disabled:cursor-not-allowed disabled:opacity-50"
          >
            {localizedDetail("add_note", "Add note")}
          </Button>
        </div>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spin size="large" />
        </div>
      ) : !notes || notes.length === 0 ? (
        <Empty description={localizedDetail("no_notes_yet", "No notes yet")} />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-white rounded-xl border border-slate-200 p-5">
              {editingId === note.id ? (
                <div className="space-y-3">
                  <Input.TextArea
                    rows={3}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="resize-none rounded-xl! border-slate-200"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="small" onClick={handleCancelEdit}>
                      {i18n.t("common.cancel")}
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      disabled={!editContent.trim()}
                      onClick={handleSaveEdit}
                      className="rounded-lg bg-[#7061ED]! hover:bg-[#5f52d4]! font-semibold"
                    >
                      {i18n.t("common.save")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      <span className="text-[#7061ED] font-medium">
                        {note.createdBy
                          ? `${note.createdBy.firstName} ${note.createdBy.lastName}`
                          : i18n.t("audit.admin_fallback")}
                      </span>
                      {" · "}
                      {new Date(note.createdAt).toLocaleDateString(getLocale(), {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {" "}
                      {new Date(note.createdAt).toLocaleTimeString(getLocale(), {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      type="text"
                      size="small"
                      onClick={() => handleEdit(note.id, note.content)}
                      className="text-xs text-[#7061ED]"
                    >
                      {i18n.t("common.edit")}
                    </Button>
                    <Button
                      type="text"
                      danger
                      size="small"
                      onClick={() => handleDelete(note.id)}
                      className="text-xs"
                    >
                      {i18n.t("common.delete")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BillRequestDetailView;
