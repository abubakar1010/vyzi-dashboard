import { App, Button, DatePicker, Empty, Form, Input, Select, Spin, Tag } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiPhone } from "react-icons/fi";
import { LuFlame, LuZap } from "react-icons/lu";
import { useNavigate, useParams } from "react-router";
import CaseTimeline from "../CaseManagement/CaseTimeline";
import {
  ACTIVATION_REQUEST_STATUS_COLOR,
  NEXT_ACTIVATION_REQUEST_STATUS,
  isOpenActivationRequest,
  type ActivationRequestStatus,
} from "../../constants/activationRequest";
import {
  useGetCaseByIdQuery,
  useUpdateCaseMutation,
  type ICase,
  type IUpdateCase,
} from "../../redux/features/Cases/caseApi";
import { useGetOffersAdminQuery } from "../../redux/features/Offers/offerApi";
import { getApiErrorMessage } from "../../utils/apiError";
import { getLocale } from "../../utils/format";

/** What the operator edits on the page, in form shape. */
type FormValues = {
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  supplyStreet: string;
  supplyStreetNumber: string;
  supplyPostalCode: string;
  supplyCity: string;
  supplyProvince: string;
  selectedOfferId?: string;
  podPdrNumber: string;
  activationDate?: Dayjs | null;
  expiryDate?: Dayjs | null;
  priority: string;
  notes: string;
  internalNotes: string;
};

const TEXT_FIELDS = [
  "contactFirstName",
  "contactLastName",
  "contactPhone",
  "supplyStreet",
  "supplyStreetNumber",
  "supplyPostalCode",
  "supplyCity",
  "supplyProvince",
  "podPdrNumber",
  "priority",
  "notes",
  "internalNotes",
] as const;

const DISPLAY_DATE = "DD/MM/YYYY";
const API_DATE = "YYYY-MM-DD";

const toFormValues = (c: ICase): FormValues => ({
  contactFirstName: c.contactFirstName ?? "",
  contactLastName: c.contactLastName ?? "",
  contactPhone: c.contactPhone ?? "",
  supplyStreet: c.supplyStreet ?? "",
  supplyStreetNumber: c.supplyStreetNumber ?? "",
  supplyPostalCode: c.supplyPostalCode ?? "",
  supplyCity: c.supplyCity ?? "",
  supplyProvince: c.supplyProvince ?? "",
  selectedOfferId: c.selectedOfferId ?? undefined,
  podPdrNumber: c.podPdrNumber ?? "",
  activationDate: c.activationDate ? dayjs(c.activationDate) : null,
  expiryDate: c.expiryDate ? dayjs(c.expiryDate) : null,
  priority: c.priority,
  notes: c.notes ?? "",
  internalNotes: c.internalNotes ?? "",
});

/** Only the fields that moved, with blanks sent as null so they clear. */
function diff(current: ICase, values: FormValues): IUpdateCase {
  const before = toFormValues(current);
  const changes: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    const next = (values[field] ?? "").trim();
    if (next !== (before[field] ?? "").trim()) changes[field] = next || null;
  }
  if (values.selectedOfferId && values.selectedOfferId !== current.selectedOfferId) {
    changes.selectedOfferId = values.selectedOfferId;
  }
  for (const field of ["activationDate", "expiryDate"] as const) {
    const next = values[field] ? values[field]!.format(API_DATE) : null;
    const prev = before[field] ? before[field]!.format(API_DATE) : null;
    if (next !== prev) changes[field] = next;
  }
  return changes as IUpdateCase;
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-4">
    <h2 className="text-xs font-bold uppercase tracking-wider text-[#7061ED]">{title}</h2>
    {children}
  </div>
);

/**
 * One "Attiva una nuova utenza" request. The operator calls the customer,
 * files the offer and the delivery point, and walks the request through
 * new → in progress → in activation → activated, or cancels or rejects it.
 */
const ActivationRequestDetail = () => {
  const { t } = useTranslation();
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();

  const { data: request, isLoading, isError } = useGetCaseByIdQuery(caseId!, { skip: !caseId });
  const [updateCase, { isLoading: isSaving }] = useUpdateCaseMutation();

  const { data: offersData, isFetching: offersLoading } = useGetOffersAdminQuery(
    { isActive: true, limit: 100 },
    { skip: !request },
  );
  // A request is for one supply; a dual offer covers either.
  const offerOptions = useMemo(
    () =>
      (offersData?.data ?? [])
        .filter((o) => o.energyType === request?.energyType || o.energyType === "dual")
        .map((o) => ({
          value: o.id,
          label: o.supplier?.name ? `${o.name} — ${o.supplier.name}` : o.name,
        })),
    [offersData, request?.energyType],
  );

  useEffect(() => {
    if (request) form.setFieldsValue(toFormValues(request));
  }, [request, form]);

  const events = useMemo(
    () =>
      [...(request?.events ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [request?.events],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spin size="large" />
      </div>
    );
  }
  if (isError || !request) {
    return (
      <div className="py-24">
        <Empty description={t("activation_requests.not_found")} />
      </div>
    );
  }

  const status = request.status as ActivationRequestStatus;
  const next = NEXT_ACTIVATION_REQUEST_STATUS[status];
  const isOpen = isOpenActivationRequest(status);

  /** Saves the edited fields, optionally together with a status move. */
  const submit = async (nextStatus?: ActivationRequestStatus) => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const changes = diff(request, values);
    if (nextStatus) changes.status = nextStatus;
    if (Object.keys(changes).length === 0) {
      message.info(t("case_management.no_changes"));
      return;
    }
    try {
      await updateCase({ id: request.id, data: changes }).unwrap();
      message.success(
        nextStatus
          ? t("activation_requests.status_changed", {
              status: t(`activation_requests.status.${nextStatus}`),
            })
          : t("activation_requests.saved"),
      );
    } catch (error) {
      message.error(getApiErrorMessage(error, t("activation_requests.save_failed")));
    }
  };

  const confirmClose = (to: "cancelled" | "rejected") =>
    modal.confirm({
      title: t(`activation_requests.confirm_${to}_title`),
      content: t(`activation_requests.confirm_${to}_body`),
      okText: t(`activation_requests.${to === "cancelled" ? "cancel_request" : "reject_request"}`),
      okButtonProps: { danger: true },
      cancelText: t("common.cancel"),
      onOk: () => submit(to),
    });

  const accountName = [request.user?.firstName, request.user?.lastName].filter(Boolean).join(" ");
  const isGas = request.energyType === "gas";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => navigate("/activation-requests")}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <FiArrowLeft className="h-4 w-4" />
            {t("activation_requests.back")}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">
              {t(`activation_requests.types.${request.caseType}`)}
              {" · "}
              {isGas ? t("home.gas") : t("home.electricity")}
            </h1>
            {isGas ? (
              <LuFlame className="h-5 w-5 text-blue-500" />
            ) : (
              <LuZap className="h-5 w-5 text-emerald-500" />
            )}
            <Tag
              color={ACTIVATION_REQUEST_STATUS_COLOR[status]}
              className="rounded-full! px-3! py-0.5! text-xs! font-semibold! border-0!"
            >
              {t(`activation_requests.status.${status}`, { defaultValue: status })}
            </Tag>
          </div>
          <p className="text-sm text-slate-500">
            {t("activation_requests.header_meta", {
              number: request.caseNumber ?? "—",
              date: new Date(request.createdAt).toLocaleString(getLocale(), {
                dateStyle: "short",
                timeStyle: "short",
              }),
            })}
          </p>
        </div>

        {isOpen && (
          <div className="flex flex-wrap gap-2">
            <Button danger onClick={() => confirmClose("rejected")} disabled={isSaving}>
              {t("activation_requests.reject_request")}
            </Button>
            <Button onClick={() => confirmClose("cancelled")} disabled={isSaving}>
              {t("activation_requests.cancel_request")}
            </Button>
            {next && (
              <Button type="primary" loading={isSaving} onClick={() => submit(next)}>
                {t("activation_requests.move_to", {
                  status: t(`activation_requests.status.${next}`),
                })}
              </Button>
            )}
          </div>
        )}
      </div>

      {next === "awaiting_activation" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("activation_requests.activation_hint")}
        </div>
      )}

      <Form<FormValues> form={form} layout="vertical" requiredMark={false}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card title={t("activation_requests.contact")}>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <Form.Item name="contactFirstName" label={t("activation_requests.first_name")}>
                  <Input />
                </Form.Item>
                <Form.Item name="contactLastName" label={t("activation_requests.last_name")}>
                  <Input />
                </Form.Item>
              </div>
              <Form.Item
                name="contactPhone"
                label={t("activation_requests.phone")}
                rules={[
                  {
                    pattern: /^(\+39)?[\d\s.\-/()]{9,}$/,
                    message: t("activation_requests.phone_invalid"),
                  },
                ]}
              >
                <Input
                  suffix={
                    request.contactPhone ? (
                      <a
                        href={`tel:${request.contactPhone}`}
                        className="flex items-center gap-1 text-[#7061ED]"
                      >
                        <FiPhone className="h-3.5 w-3.5" />
                        {t("activation_requests.call")}
                      </a>
                    ) : null
                  }
                />
              </Form.Item>
              <div className="text-xs text-slate-500 space-y-1">
                <div>
                  {t("activation_requests.account")}:{" "}
                  <span className="font-medium text-slate-700">
                    {accountName || "—"}
                    {request.user?.email ? ` · ${request.user.email}` : ""}
                  </span>
                </div>
                {request.privacyConsentAt && (
                  <div>
                    {t("activation_requests.privacy_consent", {
                      date: new Date(request.privacyConsentAt).toLocaleString(getLocale(), {
                        dateStyle: "short",
                        timeStyle: "short",
                      }),
                    })}
                  </div>
                )}
              </div>
            </Card>

            <Card title={t("activation_requests.supply_address")}>
              <Form.Item name="supplyStreet" label={t("activation_requests.street")}>
                <Input />
              </Form.Item>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <Form.Item name="supplyStreetNumber" label={t("activation_requests.street_number")}>
                  <Input />
                </Form.Item>
                <Form.Item
                  name="supplyPostalCode"
                  label={t("activation_requests.postal_code")}
                  rules={[{ pattern: /^\d{5}$/, message: t("activation_requests.postal_code_invalid") }]}
                >
                  <Input maxLength={5} />
                </Form.Item>
                <Form.Item name="supplyCity" label={t("activation_requests.city")}>
                  <Input />
                </Form.Item>
                <Form.Item name="supplyProvince" label={t("activation_requests.province")}>
                  <Input maxLength={100} />
                </Form.Item>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card title={t("activation_requests.operator_panel")}>
              <Form.Item name="selectedOfferId" label={t("activation_requests.offer")}>
                <Select
                  showSearch
                  allowClear
                  loading={offersLoading}
                  optionFilterProp="label"
                  placeholder={t("activation_requests.offer_placeholder")}
                  options={offerOptions}
                />
              </Form.Item>
              {request.selectedOffer?.supplier?.name && (
                <p className="-mt-2 text-xs text-slate-500">
                  {t("activation_requests.supplier")}:{" "}
                  <span className="font-medium text-slate-700">
                    {request.selectedOffer.supplier.name}
                  </span>
                </p>
              )}
              <Form.Item
                name="podPdrNumber"
                label={isGas ? t("activation_requests.pdr") : t("activation_requests.pod")}
                normalize={(v: string) => v?.replace(/\s+/g, "").toUpperCase()}
              >
                <Input className="font-mono" maxLength={30} />
              </Form.Item>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <Form.Item name="activationDate" label={t("activation_requests.activation_date")}>
                  <DatePicker className="w-full!" format={DISPLAY_DATE} allowClear />
                </Form.Item>
                <Form.Item name="expiryDate" label={t("activation_requests.expiry_date")}>
                  <DatePicker className="w-full!" format={DISPLAY_DATE} allowClear />
                </Form.Item>
              </div>
              <Form.Item name="priority" label={t("client_management.case_priority")}>
                <Select
                  options={["low", "medium", "high", "urgent"].map((p) => ({
                    value: p,
                    label: t(`client_management.priority_${p}`),
                  }))}
                />
              </Form.Item>
              <Form.Item name="notes" label={t("activation_requests.notes")}>
                <Input.TextArea rows={2} />
              </Form.Item>
              <Form.Item name="internalNotes" label={t("activation_requests.internal_notes")}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <div className="flex justify-end">
                <Button type="primary" loading={isSaving} onClick={() => submit()}>
                  {t("activation_requests.save")}
                </Button>
              </div>
            </Card>

            <Card title={t("activation_requests.history")}>
              <CaseTimeline events={events} />
            </Card>
          </div>
        </div>
      </Form>
    </div>
  );
};

export default ActivationRequestDetail;
