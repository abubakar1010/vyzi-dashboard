import { getLocale } from "../../../utils/format";
import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { Avatar, Button, Divider, Form, Input, Modal, Spin, Tabs, Tag } from "antd";
import { FiEdit3, FiFileText, FiLock, FiMail, FiMapPin, FiPhone, FiSend, FiUnlock, FiZap } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { CustomerStatus, IClient } from "../types";
import { addressLabelKeyFor, statusClass, statusToDisplay } from "../types";
import { useLazyGetClientByIdQuery, useToggleClientStatusMutation, useResetClientPasswordMutation } from "../../../redux/features/Users/clientApi";
import { useGetBillsAdminQuery, type IBill } from "../../../redux/features/Bills/billApi";
import { useGetCasesQuery, type ICase } from "../../../redux/features/Cases/caseApi";
import {
  useGetCustomerNotificationHistoryQuery,
  type INotificationHistoryItem,
} from "../../../redux/features/Notifications/notificationApi";
import { sweetAlertConfirmation } from "../../../lib/helpers/sweetAlertConfirmation";
import { formatPhone } from "../../../utils/formatPhone";
import { formatMoney } from "../../../utils/format";
import { passwordValidationRule } from "../../../utils/password";
import { successAlert, errorAlert } from "../../../lib/helpers/alert";
import SendCustomerNotificationModal from "./SendCustomerNotificationModal";

type ClientDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  client: IClient | null;
};

const statusTranslationKeys: Record<string, string> = {
  Active: "client_management.status_active",
  Pending: "client_management.status_pending",
  Blocked: "client_management.status_blocked",
  Inactive: "client_management.status_inactive",
};

/**
 * Same palette as the notification centre, so a message looks the same wherever
 * an operator meets it.
 */
const notificationTypeColors: Record<string, string> = {
  bill_analyzed: "blue",
  bill_verification: "gold",
  bill_updated: "cyan",
  offer_available: "green",
  case_update: "geekblue",
  contract_status: "purple",
  contract_verification: "orange",
  activation_complete: "green",
  referral_status: "magenta",
  support_reply: "volcano",
  general: "default",
};

const billStatusColors: Record<string, string> = {
  pending_email: "gold",
  uploaded: "blue",
  analyzing: "processing",
  analyzed: "green",
  error: "red",
  verification_review: "gold",
  verification_required: "orange",
  verified: "green",
  offer_sent: "purple",
  offer_accepted: "cyan",
  contract_sent: "geekblue",
  awaiting_activation: "processing",
  activated: "green",
  cancelled: "default",
};

const caseStatusColors: Record<string, string> = {
  new: "blue",
  in_progress: "processing",
  documents_pending: "orange",
  contract_sent: "geekblue",
  awaiting_activation: "processing",
  activated: "green",
  rejected: "red",
  cancelled: "default",
};

export function ClientDetailsModal({ open, onClose, client }: ClientDetailsModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("anagrafica");
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [resetForm] = Form.useForm();
  const [triggerGetClient, { data: clientDetail, isLoading, isFetching }] = useLazyGetClientByIdQuery();
  const [toggleStatus, { isLoading: toggling }] = useToggleClientStatusMutation();
  const [resetPassword, { isLoading: resetting }] = useResetClientPasswordMutation();

  const detail = clientDetail || client;
  const clientId = detail?.id;

  const { data: billsData, isLoading: billsLoading } = useGetBillsAdminQuery(
    { userId: clientId!, limit: 50 },
    { skip: !open || !clientId },
  );

  const { data: casesData, isLoading: casesLoading } = useGetCasesQuery(
    { userId: clientId!, limit: 50 },
    { skip: !open || !clientId },
  );

  const { data: notificationsData, isLoading: notificationsLoading } =
    useGetCustomerNotificationHistoryQuery(
      { userId: clientId!, limit: 50 },
      { skip: !open || !clientId },
    );

  const bills = billsData?.data || [];
  const cases = casesData?.data || [];
  const notifications = notificationsData?.data || [];

  // Extract unique supplies from bills (grouped by POD/PDR)
  const supplies = useMemo(() => {
    const supplyMap = new Map<string, { id: string; billId: string; type: "electricity" | "gas"; podPdr: string; address: string | null; meter: string | null; contract: string | null; supplier: string | null }>();
    for (const bill of bills) {
      const key = bill.podNumber || bill.pdrNumber;
      if (!key || supplyMap.has(key)) continue;
      supplyMap.set(key, {
        id: key,
        billId: bill.id,
        type: bill.billType,
        podPdr: key,
        address: bill.supplyAddress,
        meter: bill.meterNumber,
        contract: bill.contractNumber,
        supplier: bill.supplierName || bill.supplier?.name || null,
      });
    }
    return Array.from(supplyMap.values());
  }, [bills]);

  // Find assigned operator from cases
  const assignedOperator = useMemo(() => {
    for (const c of cases) {
      if (c.assignedAgent) return c.assignedAgent;
    }
    return null;
  }, [cases]);

  useEffect(() => {
    if (open && client?.id) {
      triggerGetClient(client.id);
      setActiveTab("anagrafica");
    }
  }, [open, client?.id, triggerGetClient]);

  const loading = isLoading || isFetching;

  const handleResetPassword = async (values: { newPassword: string }) => {
    if (!detail) return;
    try {
      await resetPassword({ id: detail.id, newPassword: values.newPassword }).unwrap();
      successAlert({ message: t("client_management.password_reset_success") });
      setResetModalOpen(false);
      resetForm.resetFields();
    } catch (err) {
      errorAlert({ error: err });
    }
  };

  const handleToggleStatus = () => {
    if (!detail) return;
    const isBlocking = detail.status === "active";
    sweetAlertConfirmation({
      title: isBlocking ? t("client_management.block_user") : t("client_management.unblock_user"),
      object: isBlocking ? t("client_management.block_confirm") : t("client_management.unblock_confirm"),
      okay: isBlocking ? t("client_management.block") : t("client_management.unblock"),
      conBtnColor: isBlocking ? "red" : "#7061ED",
      func: async () => {
        try {
          await toggleStatus(detail.id).unwrap();
          successAlert({
            message: isBlocking
              ? t("client_management.user_blocked_successfully")
              : t("client_management.user_unblocked_successfully"),
          });
        } catch (err) {
          errorAlert({ error: err });
        }
      },
    });
  };

  const displayStatus = detail ? statusToDisplay[detail.status] || detail.status : "";
  const primaryAddress = detail?.addresses?.[0];
  const preferences = detail?.preferences;

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(
      getLocale(),
    );
  };

  // The company a business client acts for. Registration captures it and the
  // edit form writes it, but the details view showed none of it — an admin had
  // to open the form to read back a Partita IVA.
  const renderBusinessBlock = () => {
    const business = detail?.businessProfile;
    if (!business) return null;

    const rows: Array<[string, string | null | undefined]> = [
      [t("client_management.company_name"), business.companyName],
      [t("client_management.partita_iva"), business.partitaIva],
      [t("client_management.job_role"), business.jobRole],
      [t("client_management.legal_representative"), business.legalRepresentative],
      [t("client_management.company_type"), business.companyType],
      [t("client_management.ateco_code"), business.atecoCode],
      // The company's own certified address, which is a different one from the
      // mailbox the account signs in with. Hidden by the filter below when the
      // company has not given one.
      [t("client_management.pec"), business.pecEmail],
    ];

    return (
      <div className="sm:col-span-2">
        <Divider className="my-1" />
        <p className="mb-2 text-base font-semibold text-brand">{t("client_management.business_information")}</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <p className="text-sm text-owngray">{label}</p>
                <p className="mb-2 text-[15px] font-semibold text-brand">{value}</p>
              </div>
            ))}
        </div>
      </div>
    );
  };

  const renderAnagraficaTab = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-base font-semibold text-brand">{t("client_management.personal_data")}</p>
        {/* The address the account signs in with. A company's PEC is its own
            address and is shown in the business block below. */}
        <p className="text-sm text-owngray">{t("client_management.email_label")}</p>
        <p className="mb-2 text-[15px] font-semibold text-brand">{detail!.email}</p>
        {detail!.phone && (
          <>
            <p className="text-sm text-owngray">{t("client_management.telephone")}</p>
            <p className="mb-2 text-[15px] font-semibold text-brand">{formatPhone(detail!.phone)}</p>
          </>
        )}
        {detail!.codiceFiscale && (
          <>
            <p className="text-sm text-owngray">
              {t(
                detail!.role === "business"
                  ? "client_management.owner_fiscal_code"
                  : "client_management.codice_fiscale_label",
              )}
            </p>
            <p className="mb-2 text-[15px] font-semibold text-brand">{detail!.codiceFiscale}</p>
          </>
        )}
      </div>
      <div>
        <p className="mb-2 text-base font-semibold text-brand">{t("client_management.other_info")}</p>
        <p className="text-sm text-owngray">{t("client_management.payment_method")}</p>
        <p className="mb-2 text-[15px] font-semibold text-brand">
          {preferences?.paymentMethod
            ? t(`client_management.payment_${preferences.paymentMethod}`, { defaultValue: preferences.paymentMethod })
            : "—"}
        </p>
        <p className="text-sm text-owngray">{t("client_management.invoice_type")}</p>
        <p className="mb-2 text-[15px] font-semibold text-brand">
          {preferences?.invoiceDelivery
            ? t(`client_management.invoice_${preferences.invoiceDelivery}`, { defaultValue: preferences.invoiceDelivery })
            : "—"}
        </p>
        <p className="text-sm text-owngray">{t("client_management.language_label")}</p>
        <p className="text-[15px] font-semibold text-brand">
          {preferences?.language
            ? t(`client_management.lang_${preferences.language}`, { defaultValue: preferences.language })
            : "—"}
        </p>
      </div>
      {renderBusinessBlock()}
    </div>
  );

  const renderFornitureTab = () => {
    if (billsLoading) return <div className="flex justify-center py-8"><Spin /></div>;
    if (supplies.length === 0) {
      return <p className="py-6 text-center text-sm text-owngray">{t("client_management.no_supplies")}</p>;
    }
    return (
      <div className="space-y-3">
        {supplies.map((supply) => (
          <div
            key={supply.id}
            className="rounded-lg border border-cborder/45 p-3 cursor-pointer transition-colors hover:border-[#7061ED] hover:bg-[#7061ED]/5"
            onClick={() => { onClose(); navigate(`/case-management/${supply.billId}`); }}
          >
            <div className="flex items-center gap-2 mb-2">
              <FiZap className={`h-4 w-4 ${supply.type === "electricity" ? "text-yellow-500" : "text-blue-500"}`} />
              <span className="font-semibold text-brand">
                {t(`client_management.${supply.type}`)}
              </span>
              <Tag className="rounded-full text-xs">{supply.podPdr}</Tag>
            </div>
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              {supply.supplier && (
                <div>
                  <span className="text-owngray">{t("client_management.bill_supplier")}: </span>
                  <span className="text-brand">{supply.supplier}</span>
                </div>
              )}
              {supply.address && (
                <div>
                  <span className="text-owngray">{t("client_management.supply_address")}: </span>
                  <span className="text-brand">{supply.address}</span>
                </div>
              )}
              {supply.meter && (
                <div>
                  <span className="text-owngray">{t("client_management.supply_meter")}: </span>
                  <span className="text-brand">{supply.meter}</span>
                </div>
              )}
              {supply.contract && (
                <div>
                  <span className="text-owngray">{t("client_management.supply_contract")}: </span>
                  <span className="text-brand">{supply.contract}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderBolletteTab = () => {
    if (billsLoading) return <div className="flex justify-center py-8"><Spin /></div>;
    if (bills.length === 0) {
      return <p className="py-6 text-center text-sm text-owngray">{t("client_management.no_bills")}</p>;
    }
    return (
      <div className="space-y-2">
        {bills.map((bill: IBill) => (
          <div
            key={bill.id}
            className="flex items-center justify-between rounded-lg border border-cborder/45 p-3 cursor-pointer transition-colors hover:border-[#7061ED] hover:bg-[#7061ED]/5"
            onClick={() => { onClose(); navigate(`/case-management/${bill.id}`); }}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${bill.billType === "electricity" ? "bg-yellow-50 text-yellow-600" : "bg-blue-50 text-blue-600"}`}>
                <FiZap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-brand">
                  {t(`client_management.${bill.billType}`)}
                  {(bill.podNumber || bill.pdrNumber) && (
                    <span className="ml-1.5 font-normal text-owngray">
                      {bill.podNumber || bill.pdrNumber}
                    </span>
                  )}
                </p>
                <p className="text-xs text-owngray">
                  {bill.supplierName || bill.supplier?.name || "—"}
                  {bill.billingPeriodStart && ` · ${formatDate(bill.billingPeriodStart)} – ${formatDate(bill.billingPeriodEnd)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              {bill.totalAmount != null && (
                <span className="text-sm font-semibold text-brand">{formatMoney(bill.totalAmount)}</span>
              )}
              <Tag color={billStatusColors[bill.status] || "default"} className="rounded-full text-xs">
                {t(`case_management.status.${bill.status}`, {
                  defaultValue: t(`client_management.status_${bill.status}`, {
                    defaultValue: bill.status.replace(/_/g, " "),
                  }),
                })}
              </Tag>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCaseTab = () => {
    if (casesLoading) return <div className="flex justify-center py-8"><Spin /></div>;
    if (cases.length === 0) {
      return <p className="py-6 text-center text-sm text-owngray">{t("client_management.no_cases")}</p>;
    }
    return (
      <div className="space-y-2">
        {cases.map((c: ICase) => (
          <div
            key={c.id}
            className="rounded-lg border border-cborder/45 p-3 cursor-pointer transition-colors hover:border-[#7061ED] hover:bg-[#7061ED]/5"
            onClick={() => { onClose(); navigate(`/case-management/case/${c.id}`); }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-brand">
                {c.caseNumber || c.id.slice(0, 8)}
              </span>
              <Tag color={caseStatusColors[c.status] || "default"} className="rounded-full text-xs">
                {t(`case_management.status.${c.status}`, {
                  defaultValue: t(`client_management.status_${c.status}`, {
                    defaultValue: c.status.replace(/_/g, " "),
                  }),
                })}
              </Tag>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-owngray">
              <span>{t("client_management.case_type")}: <span className="text-brand">{t(`activation_requests.types.${c.caseType}`, { defaultValue: c.caseType.replace(/_/g, " ") })}</span></span>
              {c.toSupplier && (
                <span>{t("client_management.case_supplier")}: <span className="text-brand">{c.toSupplier.name}</span></span>
              )}
              <span>{t("client_management.case_priority")}: <span className="text-brand">{t(`client_management.priority_${c.priority}`, { defaultValue: c.priority })}</span></span>
              <span>{t("client_management.case_created")}: <span className="text-brand">{formatDate(c.createdAt)}</span></span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  /**
   * Every notification this customer received, with the operator who sent it.
   *
   * Rows the platform raised automatically have no sender and are labelled as
   * sent by the system — a blank would read as missing data rather than as
   * "nobody typed this". Unlike the other tabs these rows are not clickable:
   * a notification is a record of something said, not a place to navigate to.
   */
  const renderNotificheTab = () => {
    if (notificationsLoading) return <div className="flex justify-center py-8"><Spin /></div>;
    if (notifications.length === 0) {
      return <p className="py-6 text-center text-sm text-owngray">{t("client_management.no_notifications")}</p>;
    }
    return (
      <div className="space-y-2">
        {notifications.map((n: INotificationHistoryItem) => (
          <div key={n.id} className="rounded-lg border border-cborder/45 p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-sm font-semibold text-brand">{n.title}</span>
              <Tag
                color={notificationTypeColors[n.type] || "default"}
                className="rounded-full text-xs shrink-0"
              >
                {t(`notifications.type_${n.type}`, { defaultValue: n.type.replace(/_/g, " ") })}
              </Tag>
            </div>
            <p className="whitespace-pre-wrap text-xs text-owngray">{n.body}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-owngray">
              <span>{new Date(n.createdAt).toLocaleString(getLocale())}</span>
              <span>
                {t("client_management.sent_by")}:{" "}
                <span className="text-brand">
                  {n.sender
                    ? `${n.sender.firstName || ""} ${n.sender.lastName || ""}`.trim() || n.sender.email
                    : t("client_management.sent_by_system")}
                </span>
              </span>
              {n.templateName && (
                <Tag className="rounded-full border-0 bg-slate-100 text-xs text-slate-500">
                  {n.templateName}
                </Tag>
              )}
              {!n.isRead && (
                <span className="text-[#7061ED]">{t("client_management.notification_unread")}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderGdprTab = () => {
    if (!preferences) {
      return <p className="py-6 text-center text-sm text-owngray">{t("client_management.no_gdpr_data")}</p>;
    }
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-cborder/45 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-owngray">{t("client_management.gdpr_consent")}</p>
              <p className="text-[15px] font-semibold text-brand">
                {preferences.gdprConsentAt
                  ? <Tag color="green" className="rounded-full">{t("client_management.gdpr_consent_given")}</Tag>
                  : <Tag color="red" className="rounded-full">{t("client_management.gdpr_consent_not_given")}</Tag>
                }
              </p>
            </div>
            {preferences.gdprConsentAt && (
              <div>
                <p className="text-sm text-owngray">{t("client_management.gdpr_consent_date")}</p>
                <p className="text-[15px] font-semibold text-brand">{formatDate(preferences.gdprConsentAt)}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-owngray">{t("client_management.marketing_consent")}</p>
              <p className="text-[15px] font-semibold text-brand">
                {preferences.marketingConsent
                  ? <Tag color="green" className="rounded-full">{t("common.yes")}</Tag>
                  : <Tag color="red" className="rounded-full">{t("common.no")}</Tag>
                }
              </p>
            </div>
            {preferences.contactPreference && (
              <div>
                <p className="text-sm text-owngray">{t("client_management.contact_preference")}</p>
                <p className="text-[15px] font-semibold text-brand">{preferences.contactPreference}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const tabContent: Record<string, () => JSX.Element | null> = {
    anagrafica: renderAnagraficaTab,
    forniture: renderFornitureTab,
    bollette: renderBolletteTab,
    case: renderCaseTab,
    notifiche: renderNotificheTab,
    gdpr: renderGdprTab,
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      centered
      destroyOnClose
      title={null}
    >
      {loading && !detail ? (
        <div className="flex items-center justify-center py-16">
          <Spin size="large" />
        </div>
      ) : detail ? (
        <div className="pt-2">
          {/* Header: Avatar + Name + Email + Status */}
          <div className="flex items-start gap-3">
            <Avatar size={50} className="bg-indigo-500 flex-shrink-0">
              {detail.firstName?.charAt(0) || detail.email.charAt(0)}
            </Avatar>
            <div>
              <h3 className="text-[22px] font-semibold leading-tight text-brand">
                {detail.firstName} {detail.lastName}
              </h3>
              <p className="text-sm text-owngray">{detail.email}</p>
              <Tag
                color={statusClass[displayStatus as CustomerStatus] || "default"}
                className="mt-1 rounded-full"
              >
                {t(statusTranslationKeys[displayStatus] || displayStatus)}
              </Tag>
            </div>
          </div>

          {/* Contact info */}
          <div className="mt-4 space-y-1.5 text-[14px] text-gray-700">
            {detail.phone && (
              <p className="flex items-center gap-2">
                <FiPhone className="h-3.5 w-3.5 text-owngray" /> {formatPhone(detail.phone)}
              </p>
            )}
            <p className="flex items-center gap-2">
              <FiMail className="h-3.5 w-3.5 text-owngray" /> {detail.email}
            </p>
            {/* Whichever identifier this account carries — a private customer
                their Codice Fiscale, a company its Partita IVA. One each, so
                the header row shows the one that exists rather than leaving a
                business client with no tax ID on it at all. */}
            {detail.codiceFiscale && (
              <p className="flex items-center gap-2">
                <FiFileText className="h-3.5 w-3.5 text-owngray" /> {t("client_management.codice_fiscale_label")}: {detail.codiceFiscale}
              </p>
            )}
            {detail.businessProfile?.partitaIva && (
              <p className="flex items-center gap-2">
                <FiFileText className="h-3.5 w-3.5 text-owngray" /> {t("client_management.partita_iva")}: {detail.businessProfile.partitaIva}
              </p>
            )}
            {/* Named by type, because a company's address is its registered
                office and calling it a residence is simply wrong — and the
                fallback follows the role for the same reason. */}
            {primaryAddress && (
              <p className="flex items-center gap-2">
                <FiMapPin className="h-3.5 w-3.5 text-owngray" />
                {t(addressLabelKeyFor(primaryAddress.addressType, detail.role))}:{" "}
                {primaryAddress.streetAddress}, {primaryAddress.city}
                {primaryAddress.province ? ` (${primaryAddress.province})` : ""}
                {primaryAddress.postalCode ? ` ${primaryAddress.postalCode}` : ""}
              </p>
            )}
          </div>

          {/* Assigned operator */}
          {assignedOperator && (
            <>
              <Divider className="my-3" />
              <div className="flex items-center gap-2.5">
                <Avatar size={32} className="bg-gray-200 text-gray-600 text-xs">
                  {assignedOperator.firstName?.charAt(0) || "O"}
                </Avatar>
                <div>
                  <p className="text-xs text-owngray">{t("client_management.assigned_operator")}</p>
                  <p className="text-sm font-semibold text-brand">
                    {assignedOperator.firstName} {assignedOperator.lastName}
                  </p>
                </div>
              </div>
            </>
          )}

          <Divider className="my-3" />

          {/* Tabs */}
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              { key: "anagrafica", label: t("client_management.tab_personal_data") },
              { key: "forniture", label: `${t("client_management.tab_supplies")}${supplies.length ? ` (${supplies.length})` : ""}` },
              { key: "bollette", label: `${t("client_management.tab_bills")}${bills.length ? ` (${bills.length})` : ""}` },
              { key: "case", label: `${t("client_management.tab_cases")}${cases.length ? ` (${cases.length})` : ""}` },
              { key: "notifiche", label: `${t("client_management.tab_notifications")}${notifications.length ? ` (${notifications.length})` : ""}` },
              { key: "gdpr", label: t("client_management.tab_gdpr") },
            ]}
          />

          {/* Tab content */}
          <div className="min-h-[120px]">
            {tabContent[activeTab]?.()}
          </div>

          <Divider className="my-3" />

          {/* Action buttons — side by side */}
          <div className="flex gap-3">
            <Button
              type="primary"
              icon={<FiSend />}
              className="flex-1 pb-0.5!"
              size="large"
              onClick={() => setNotifyModalOpen(true)}
            >
              {t("notifications.send_notification")}
            </Button>
            <Button
              icon={<FiEdit3 />}
              className="flex-1 pb-0.5!"
              size="large"
              onClick={() => setResetModalOpen(true)}
            >
              {t("client_management.reset_password")}
            </Button>
            <Button
              danger={detail.status !== "suspended"}
              icon={detail.status === "suspended" ? <FiUnlock /> : <FiLock />}
              className="flex-1 pb-0.5!"
              size="large"
              loading={toggling}
              onClick={handleToggleStatus}
            >
              {detail.status === "suspended" ? t("client_management.unblock_user") : t("client_management.block_user")}
            </Button>
          </div>

          <SendCustomerNotificationModal
            isOpen={notifyModalOpen}
            client={detail}
            onClose={() => setNotifyModalOpen(false)}
          />

          {/* Reset Password Modal */}
          <Modal
            open={resetModalOpen}
            onCancel={() => { setResetModalOpen(false); resetForm.resetFields(); }}
            footer={null}
            width={420}
            centered
            destroyOnClose
            title={t("client_management.reset_password")}
          >
            <p className="mb-4 text-sm text-owngray">
              {t("client_management.set_new_password_for")} <strong>{detail.email}</strong>
            </p>
            {/* See the same dialog on the customer table — the password box must
                not be offered the admin's own saved credential. */}
            <Form
              form={resetForm}
              name="reset_client_password_detail_form"
              autoComplete="off"
              layout="vertical"
              onFinish={handleResetPassword}
            >
              <Form.Item
                name="newPassword"
                label={t("client_management.new_password")}
                rules={[
                  { required: true, message: t("client_management.password_required") },
                  passwordValidationRule(t("client_management.password_policy")),
                ]}
              >
                <Input.Password autoFocus autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label={t("client_management.confirm_password")}
                dependencies={["newPassword"]}
                rules={[
                  { required: true, message: t("client_management.confirm_password_required") },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("newPassword") === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error(t("client_management.passwords_do_not_match")));
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <div className="flex justify-end gap-2">
                <Button onClick={() => { setResetModalOpen(false); resetForm.resetFields(); }}>
                  {t("common.cancel")}
                </Button>
                <Button type="primary" htmlType="submit" loading={resetting}>
                  {t("client_management.reset_password")}
                </Button>
              </div>
            </Form>
          </Modal>
        </div>
      ) : null}
    </Modal>
  );
}
