import i18n from "../../i18n";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "../../utils/apiError";
import { useEffect, useMemo, useState } from "react";
import {
  App,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Checkbox,
  Alert,
  Spin,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { ICase, IUpdateCase } from "../../redux/features/Cases/caseApi";
import { useUpdateCaseMutation } from "../../redux/features/Cases/caseApi";
import type { IBill } from "../../redux/features/Bills/billApi";
import { useUpdateBillAdminMutation } from "../../redux/features/Bills/billApi";
import { useGetOffersAdminQuery } from "../../redux/features/Offers/offerApi";
import { useGetSuppliersQuery } from "../../redux/features/Suppliers/supplierApi";
import { useGetAgentsQuery, useUpdateClientMutation } from "../../redux/features/Users/clientApi";
import type { IUpdateClient } from "../ClientManagement/types";
import {
  normalizeTaxId,
  taxIdMessage,
  isValidCodiceFiscale,
  isValidPartitaIva,
} from "../../utils/italianTaxId";
import { baseApi } from "../../redux/api/baseApi";
import { useAppDispatch } from "../../redux/hooks";
import BillFields from "./BillFields";
import { billInitialValues, diffBillValues } from "./billFieldValues";
import { isActivationRequestType } from "../../constants/activationRequest";

interface EditCaseModalProps {
  caseData: ICase | null;
  /** The full bill the case was opened from — the case's own copy is a subset. */
  bill: IBill | null;
  open: boolean;
  onClose: () => void;
}

const CAP_PATTERN = /^\d{5}$/;
const DATE_FORMAT = "YYYY-MM-DD";

/** The five fields, in the order they read on an Italian address. */
const ADDRESS_FIELDS = [
  { key: "Street", get label() { return i18n.t("ocr.street"); }, span: "col-span-4", max: 255, placeholder: "Via Roma" },
  { key: "StreetNumber", get label() { return i18n.t("ocr.number"); }, span: "col-span-2", max: 20, placeholder: "42" },
  { key: "City", get label() { return i18n.t("ocr.city"); }, span: "col-span-2", max: 100, placeholder: "Milano" },
  { key: "PostalCode", get label() { return i18n.t("audit.postal_code_cap"); }, span: "col-span-2", max: 5, placeholder: "20121" },
  { key: "Province", get label() { return i18n.t("ocr.province"); }, span: "col-span-2", max: 100, placeholder: "MI" },
] as const;

type Block = "supply" | "residential" | "shipping";

const ADDRESS_KEYS: string[] = (["supply", "residential", "shipping"] as Block[]).flatMap(
  (block) => ADDRESS_FIELDS.map((f) => `${block}${f.key}`),
);

/** The fields that are plain text and diff by string comparison. */
const TEXT_KEYS = [
  "notes",
  "internalNotes",
  "invoiceEmail",
  "iban",
  "ibanHolderFirstName",
  "ibanHolderLastName",
  "ibanHolderTaxCode",
] as const;

/**
 * What an activation request holds on the case itself: a switch reads these
 * off its bill and its account. Only sent for an activation request, because
 * nothing renders them on any other case and a blank would read as a clearing.
 */
const ACTIVATION_TEXT_KEYS = [
  "contactFirstName",
  "contactLastName",
  "contactEmail",
  "contactPhone",
  "contactTaxCode",
  "energyType",
  "podPdrNumber",
  "meterNumber",
  "supplyContractNumber",
] as const;

/** The fields that are picked from a fixed list. */
const SELECT_KEYS = [
  "caseType",
  "priority",
  "selectedOfferId",
  "assignedAgentId",
  "fromSupplierId",
  "paymentMethod",
  "invoiceDelivery",
] as const;

/** The fields that are numbers, and diff numerically rather than as text. */
const NUMBER_KEYS = ["estimatedAnnualValue", "slaDaysTotal"] as const;

/**
 * The date fields, and what the server stores each as.
 *
 * `activationDate` and `expiryDate` are `date` columns and travel as plain
 * `YYYY-MM-DD`. `contractSentAt` and `slaDeadline` are instants: the case only
 * ever shows them by day, so a day picked here is anchored to the edge of that
 * day the field means — the moment the contract went out, and the last moment
 * the case is still inside its SLA.
 */
const DATE_KEYS = [
  { key: "activationDate", as: "day" },
  { key: "expiryDate", as: "day" },
  { key: "contractSentAt", as: "startOfDay" },
  { key: "slaDeadline", as: "endOfDay" },
] as const;

/** A picked day, in the shape the column behind it is stored in. */
const serializeDate = (value: Dayjs | null, as: (typeof DATE_KEYS)[number]["as"]) => {
  if (!value) return null;
  if (as === "day") return value.format(DATE_FORMAT);
  return (as === "endOfDay" ? value.endOf("day") : value.startOf("day")).toISOString();
};

/**
 * The customer's own record, which lives on their account rather than on the
 * case. Edited here anyway: the name and tax code the switch is submitted under
 * are these, and an admin who has just spotted a wrong Codice Fiscale on the
 * case should not have to leave for Client Management to fix it.
 */
const CUSTOMER_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "codiceFiscale",
  "partitaIva",
  "companyName",
  "pecEmail",
] as const;

/**
 * The ones the account cannot exist without — the server refuses them blank.
 * `companyName` is among them because `business_profiles.company_name` is NOT
 * NULL: cleared, it would reach the API as null and fail the save halfway
 * through, after the case and bill requests have already gone through.
 */
const CUSTOMER_REQUIRED = new Set<string>([
  "firstName",
  "lastName",
  "email",
  "companyName",
]);

/** A request is one or the other; it never turns into a switch. */
const ACTIVATION_CASE_TYPE_OPTIONS = [
  { value: "takeover", get label() { return i18n.t("audit.takeover"); } },
  { value: "new_activation", get label() { return i18n.t("audit.new_activation"); } },
];

const CASE_TYPE_OPTIONS = [
  { value: "switch", get label() { return i18n.t("audit.switch"); } },
  { value: "transfer", get label() { return i18n.t("audit.transfer"); } },
  { value: "takeover", get label() { return i18n.t("audit.takeover"); } },
  { value: "new_activation", get label() { return i18n.t("audit.new_activation"); } },
];

const PRIORITY_OPTIONS = [
  { value: "low", get label() { return i18n.t("support_ticket.low"); } },
  { value: "medium", get label() { return i18n.t("support_ticket.medium"); } },
  { value: "high", get label() { return i18n.t("support_ticket.high"); } },
  { value: "urgent", get label() { return i18n.t("support_ticket.urgent"); } },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "rid_bancario", get label() { return i18n.t("audit.direct_debit_sdd"); } },
  { value: "postal_order", get label() { return i18n.t("offers_market.postal_order"); } },
  { value: "credit_card", get label() { return i18n.t("client_management.payment_credit_card"); } },
  { value: "bank_transfer", get label() { return i18n.t("client_management.payment_bank_transfer"); } },
];

const INVOICE_DELIVERY_OPTIONS = [
  { value: "digital", get label() { return i18n.t("audit.digital_by_email"); } },
  { value: "paper", get label() { return i18n.t("audit.paper_by_post"); } },
];

/** The rejection's message in the admin's language, or the fallback. */
const errorMessage = (err: unknown, fallback: string): string => getApiErrorMessage(err, fallback);

/**
 * Corrects everything the Case Overview shows, in one form.
 *
 * The tab spans three records — the case, the bill it was opened from, and the
 * customer's account — and an admin reading a card has no reason to know which
 * of the three owns the field they are looking at. So the form edits all three
 * and saves each with its own request, in order, reporting exactly which ones
 * landed if one is refused. The bill fields are the shared definition the Bill
 * Data tab renders, so the two can never mean different things.
 *
 * Two fields are deliberately absent. The workflow status moves through the
 * pipeline controls, which run the transition rules the switch depends on. The
 * case number is generated from a per-day sequence behind a unique index, so
 * retyping one could only collide with the case already holding it — it is
 * shown at the top of the form as a read-only heading instead.
 *
 * Residence and shipping each carry a "same as supply" flag. While it is ticked
 * the block is a copy of the supply address and the server keeps it that way,
 * so those fields are shown filled from supply and locked rather than left
 * editable and silently overwritten on save.
 */
export default function EditCaseModal({
  caseData: liveCase,
  bill: liveBill,
  open,
  onClose,
}: EditCaseModalProps) {
  useTranslation();

  // The records as they stood when the modal opened. The case and bill queries
  // refetch whenever the window regains focus, and a fresh copy used to reseed
  // the form — wiping everything typed so far, so "Save changes" found nothing
  // to save. Held still until the modal closes; the bill is taken as soon as it
  // arrives, since it can load after the case.
  const [snapshot, setSnapshot] = useState<{ caseData: ICase; bill: IBill | null } | null>(null);
  useEffect(() => {
    if (!open) {
      setSnapshot(null);
      return;
    }
    setSnapshot((prev) => {
      if (!prev) return liveCase ? { caseData: liveCase, bill: liveBill } : null;
      if (!prev.bill && liveBill) return { ...prev, bill: liveBill };
      return prev;
    });
  }, [open, liveCase, liveBill]);
  const caseData = snapshot?.caseData ?? liveCase;
  const bill = snapshot?.bill ?? liveBill;

  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const [form] = Form.useForm();
  const [updateCase, { isLoading: savingCase }] = useUpdateCaseMutation();
  const [updateBill, { isLoading: savingBill }] = useUpdateBillAdminMutation();
  const [updateClient, { isLoading: savingCustomer }] = useUpdateClientMutation();

  const [residentialSame, setResidentialSame] = useState(true);
  const [shippingSame, setShippingSame] = useState(true);
  // Tri-state on purpose: null means the case predates the question, and
  // saving it as `false` would assert a third-party mandate nobody asked about.
  const [ibanSame, setIbanSame] = useState<boolean | null>(null);

  // Only fetched while the modal is open — both lists are long and nobody
  // reading the case needs them. 100 is the server's page-size cap
  // (PaginationDto @Max(100)); anything larger is rejected with a 400.
  const { data: offerPage, isFetching: offersLoading } = useGetOffersAdminQuery(
    { limit: 100, isActive: true },
    { skip: !open },
  );
  const { data: supplierPage, isFetching: suppliersLoading } = useGetSuppliersQuery(
    { limit: 100 },
    { skip: !open },
  );
  const { data: agents, isFetching: agentsLoading } = useGetAgentsQuery(undefined, {
    skip: !open,
  });

  const paymentMethod = Form.useWatch("paymentMethod", form);
  const invoiceDelivery = Form.useWatch("invoiceDelivery", form);
  const activationDate = Form.useWatch("activationDate", form) as Dayjs | null;
  const expiryDate = Form.useWatch("expiryDate", form) as Dayjs | null;
  const billType = Form.useWatch(["bill", "billType"], form) as string | undefined;
  const isDirectDebit = paymentMethod === "rid_bancario";

  const isPaper = invoiceDelivery === "paper";
  // Read off the form rather than the record, so switching the utility swaps
  // the consumption field without waiting for a save.
  const isElectricity = (billType ?? bill?.billType) === "electricity";
  const isBusiness = caseData?.user?.role === "business" || !!caseData?.user?.businessProfile;
  const isActivationCase = isActivationRequestType(caseData?.caseType);

  /**
   * The offer the case is on may have been archived or deactivated since the
   * customer accepted it, so it is added to the list explicitly — otherwise the
   * select would show a blank where the current offer should be.
   */
  const offerOptions = useMemo(() => {
    // A request is for one supply; a dual offer covers either.
    const supply = isActivationRequestType(caseData?.caseType) ? caseData?.energyType : null;
    const options = (offerPage?.data || [])
      .filter((offer) => !supply || offer.energyType === supply || offer.energyType === "dual")
      .map((offer) => ({
        value: offer.id,
        label: offer.supplier?.name ? `${offer.name} — ${offer.supplier.name}` : offer.name,
      }));
    const current = caseData?.selectedOffer;
    if (current && !options.some((o) => o.value === current.id)) {
      options.unshift({
        value: current.id,
        label: i18n.t("audit.option_current", {
          label: current.supplier?.name ? `${current.name} — ${current.supplier.name}` : current.name,
        }),
      });
    }
    return options;
  }, [offerPage, caseData]);

  /** Same reasoning as the offers: a supplier since retired must still show. */
  const supplierOptions = useMemo(() => {
    const options = (supplierPage?.data || []).map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
    }));
    const current = caseData?.fromSupplier;
    if (current && !options.some((o) => o.value === current.id)) {
      options.unshift({ value: current.id, label: i18n.t("audit.option_current", { label: current.name }) });
    }
    return options;
  }, [supplierPage, caseData]);

  /**
   * The roster only carries admins who can still log in, so a case handed to
   * someone since suspended keeps them listed — otherwise the select would read
   * as unassigned and the next save would quietly drop the handler.
   */
  const agentOptions = useMemo(() => {
    const options = (agents || []).map((agent) => ({
      value: agent.id,
      label: `${agent.firstName} ${agent.lastName}`.trim() || agent.email,
    }));
    const current = caseData?.assignedAgent;
    if (current && !options.some((o) => o.value === current.id)) {
      options.unshift({
        value: current.id,
        label: i18n.t("audit.option_inactive", { label: `${current.firstName} ${current.lastName}`.trim() || current.email }),
      });
    }
    return options;
  }, [agents, caseData]);

  /**
   * The customer's account, as the form holds it. The company's own details
   * live on the business profile rather than the user row, so they are lifted
   * up beside the rest — the form has no reason to expose where each column
   * sits.
   */
  const customerInitialValues = useMemo(() => {
    const user = caseData?.user;
    if (!user) return {};
    return {
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      codiceFiscale: user.codiceFiscale ?? null,
      partitaIva: user.businessProfile?.partitaIva ?? null,
      companyName: user.businessProfile?.companyName ?? null,
      pecEmail: user.businessProfile?.pecEmail ?? null,
    } as Record<string, string | null>;
  }, [caseData]);

  const initialValues = useMemo(() => {
    if (!caseData) return {};
    const record = caseData as unknown as Record<string, unknown>;
    return {
      ...Object.fromEntries(ADDRESS_KEYS.map((key) => [key, (record[key] as string) ?? null])),
      ...Object.fromEntries(TEXT_KEYS.map((key) => [key, (record[key] as string) ?? null])),
      ...Object.fromEntries(ACTIVATION_TEXT_KEYS.map((key) => [key, (record[key] as string) ?? null])),
      annualConsumption: record.annualConsumption == null ? null : Number(record.annualConsumption),
      ...Object.fromEntries(SELECT_KEYS.map((key) => [key, (record[key] as string) ?? null])),
      // Postgres hands `decimal` columns over as strings, so the figure has to
      // be coerced before it reaches an InputNumber that would otherwise treat
      // "1140.00" as text and report every save as a change.
      ...Object.fromEntries(
        NUMBER_KEYS.map((key) => [key, record[key] == null ? null : Number(record[key])]),
      ),
      ...Object.fromEntries(
        DATE_KEYS.map(({ key }) => [key, record[key] ? dayjs(record[key] as string) : null]),
      ),
      // The other two records the tab shows, each under its own key so the
      // bill's supply address and tax codes cannot collide with the case's own
      // fields of the same name.
      bill: billInitialValues(bill),
      customer: customerInitialValues,
    } as Record<string, unknown>;
  }, [caseData, bill, customerInitialValues]);

  useEffect(() => {
    if (!open || !caseData) return;
    form.setFieldsValue(initialValues);
    setResidentialSame(caseData.residentialSameAsSupply);
    setShippingSame(caseData.shippingSameAsSupply);
    setIbanSame(caseData.ibanSameAsContract ?? null);
  }, [open, caseData, form, initialValues]);

  /** Mirrors the supply fields into a block the admin just declared identical. */
  const mirrorSupply = (block: Exclude<Block, "supply">) => {
    const values = form.getFieldsValue();
    form.setFieldsValue(
      Object.fromEntries(
        ADDRESS_FIELDS.map((f) => [`${block}${f.key}`, values[`supply${f.key}`] ?? null]),
      ),
    );
  };

  /** Only what the admin changed on the case itself. */
  const diffCase = (values: Record<string, unknown>) => {
    const changed: Record<string, unknown> = {};

    if (residentialSame !== caseData?.residentialSameAsSupply) {
      changed.residentialSameAsSupply = residentialSame;
    }
    if (shippingSame !== caseData?.shippingSameAsSupply) {
      changed.shippingSameAsSupply = shippingSame;
    }
    if (ibanSame !== (caseData?.ibanSameAsContract ?? null)) {
      changed.ibanSameAsContract = ibanSame;
    }

    const textKeys: string[] = [
      ...ADDRESS_KEYS,
      ...TEXT_KEYS,
      ...SELECT_KEYS,
      ...(isActivationCase ? ACTIVATION_TEXT_KEYS : []),
    ];
    for (const key of textKeys) {
      // Blank means "clear this field", which the server reads as null. The
      // offer is the one field the case cannot be left without.
      let next = ((values[key] as string) ?? null) || null;
      // The server validates the tax ID before it normalises it, so a code
      // typed in the grouped form it is printed in would be refused for the
      // spaces alone. Send it as it will be stored.
      if ((key === "ibanHolderTaxCode" || key === "contactTaxCode") && next) {
        next = normalizeTaxId(next);
      }
      const previous = ((initialValues as Record<string, unknown>)[key] as string) ?? null;
      if (next !== previous) changed[key] = next;
    }

    const numberKeys: string[] = [
      ...NUMBER_KEYS,
      ...(isActivationCase ? ["annualConsumption"] : []),
    ];
    for (const key of numberKeys) {
      // A cleared InputNumber yields null, which is how a figure that was
      // entered against the wrong case is taken back off it.
      const raw = values[key];
      const next = raw == null || raw === "" ? null : Number(raw);
      const previous = (initialValues as Record<string, number | null>)[key] ?? null;
      if (next !== previous) changed[key] = next;
    }

    for (const { key, as } of DATE_KEYS) {
      const next = serializeDate((values[key] as Dayjs | null) ?? null, as);
      const previous = serializeDate(
        (initialValues as Record<string, Dayjs | null>)[key] ?? null,
        as,
      );
      if (next !== previous) changed[key] = next;
    }

    return changed;
  };

  /** Only what the admin changed on the customer's account. */
  const diffCustomer = (values: Record<string, unknown>) => {
    const changed: Record<string, unknown> = {};
    for (const key of CUSTOMER_KEYS) {
      // The company's own details; a private account has no profile row to
      // write them to, so the fields are not shown and not sent.
      if (
        (key === "partitaIva" || key === "companyName" || key === "pecEmail") &&
        !isBusiness
      ) {
        continue;
      }
      let next = ((values[key] as string) ?? null) || null;
      if ((key === "codiceFiscale" || key === "partitaIva") && next) {
        next = normalizeTaxId(next);
      }
      // The server refuses a blank name or email outright, so a field the form
      // marks required is never sent empty — it is simply left as it was.
      if (next === null && CUSTOMER_REQUIRED.has(key)) continue;
      const previous = customerInitialValues[key] ?? null;
      if (next !== previous) changed[key] = next;
    }
    return changed;
  };

  const handleSubmit = async () => {
    if (!caseData) return;
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch (err) {
      // The form scrolls, so the offending field is often well out of view —
      // refusing without a word reads as a dead button. Bring it into view and
      // say what is wrong with it.
      const errorFields = (err as { errorFields?: { name: (string | number)[]; errors: string[] }[] })
        ?.errorFields;
      if (!errorFields?.length) {
        message.error(i18n.t("audit.save_failed_unexpected"));
        return;
      }
      form.scrollToField(errorFields[0].name, { behavior: "smooth", block: "center" });
      message.error(i18n.t("audit.save_blocked", { error: errorFields[0].errors[0] }));
      return;
    }

    const caseChanges = diffCase(values);
    const billChanges = bill
      ? diffBillValues((values.bill as Record<string, unknown>) ?? {},
          (initialValues as { bill: Record<string, unknown> }).bill)
      : {};
    // An activation request names its own holder, and leaves the account alone.
    const customerChanges = caseData.user && !isActivationCase
      ? diffCustomer((values.customer as Record<string, unknown>) ?? {})
      : {};

    // Three records, three requests, and no transaction spanning them — so they
    // run in order and the first refusal stops the rest, with the message
    // naming what did land. Silently reporting "updated" after a half-applied
    // save is the one outcome an admin cannot recover from.
    const saves: { label: string; run: () => Promise<unknown> }[] = [];
    if (Object.keys(caseChanges).length > 0) {
      saves.push({
        label: i18n.t("audit.save_part_case"),
        run: () => updateCase({ id: caseData.id, data: caseChanges as IUpdateCase }).unwrap(),
      });
    }
    if (bill && Object.keys(billChanges).length > 0) {
      saves.push({
        label: i18n.t("audit.bill_data_2"),
        run: () => updateBill({ billId: bill.id, data: billChanges }).unwrap(),
      });
    }
    if (caseData.user && Object.keys(customerChanges).length > 0) {
      saves.push({
        label: i18n.t("audit.save_part_customer"),
        // The account save invalidates `user`, which the case detail does not
        // subscribe to — it reads the customer through its own `case` entry.
        // Without this the corrected name sits in the database while the card
        // behind the modal still shows the old one.
        run: async () => {
          await updateClient({
            id: caseData.user!.id,
            data: customerChanges as IUpdateClient,
          }).unwrap();
          // Every case of this customer embeds the same account, so all of
          // them are refetched, not only the one open here — and the bill,
          // which carries the account too.
          dispatch(
            baseApi.util.invalidateTags([
              "case",
              ...(bill ? [{ type: "bill" as const, id: bill.id }] : []),
            ]),
          );
        },
      });
    }

    if (saves.length === 0) {
      message.info(i18n.t("case_management.no_changes"));
      return;
    }

    const done: string[] = [];
    for (const save of saves) {
      try {
        await save.run();
        done.push(save.label);
      } catch (err) {
        // Anything that is not an API rejection (a thrown bug, a dropped
        // connection) still gets named, never swallowed.
        const detail = errorMessage(err, i18n.t("audit.save_part_failed", { part: save.label }));
        message.error(
          done.length > 0 ? i18n.t("audit.save_partial", { detail, parts: done.join(", ") }) : detail,
        );
        return;
      }
    }

    message.success(i18n.t("audit.case_updated"));
    onClose();
  };

  const addressBlock = (block: Block, readOnly = false) => (
    <div className="grid grid-cols-6 gap-x-4">
      {ADDRESS_FIELDS.map((f) => (
        <Form.Item
          key={f.key}
          name={`${block}${f.key}`}
          label={f.label}
          className={f.span}
          // A locked block is a copy of the supply address, which is checked on
          // its own — an error here would point at a field the admin cannot edit.
          rules={
            f.key === "PostalCode" && !readOnly
              ? [{ pattern: CAP_PATTERN, message: i18n.t("audit.cap_must_be_5_digits") }]
              : undefined
          }
        >
          <Input
            maxLength={f.max}
            placeholder={f.placeholder}
            readOnly={readOnly}
            className={readOnly ? "!bg-slate-50 !text-slate-500" : undefined}
            onChange={
              block === "supply"
                ? () => {
                    // Keep the locked copies in step as the supply address is
                    // retyped — the server does the same on save.
                    if (residentialSame) mirrorSupply("residential");
                    if (shippingSame) mirrorSupply("shipping");
                  }
                : undefined
            }
          />
        </Form.Item>
      ))}
    </div>
  );

  const section = (title: string, hint: string, body: React.ReactNode) => (
    <div className="mb-5">
      <h4 className="text-sm font-semibold text-slate-700 mb-1">{title}</h4>
      <p className="text-xs text-slate-400 mb-3">{hint}</p>
      {body}
    </div>
  );

  return (
    <Modal
      title={i18n.t("audit.edit_case_data")}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={i18n.t("common.save_changes")}
      confirmLoading={savingCase || savingBill || savingCustomer}
      width={820}
      destroyOnClose
    >
      {/* The one identifier on the case that is not editable, kept in view so
          the admin can tell at a glance which case the form is open on. */}
      {caseData?.caseNumber && (
        <p className="mt-1 text-xs text-slate-400">
          {i18n.t("notifications.context_case")} <span className="font-semibold text-slate-600">{caseData.caseNumber}</span> {i18n.t("audit.the_case_number_is_generated_and_cannot_be_changed")}
        </p>
      )}

      <Form form={form} layout="vertical" className="mt-4 max-h-[65vh] overflow-y-auto pr-2">
        {/* ── Classification & handling ── */}
        {section(
          i18n.t("audit.edit_case_section_case"),
          i18n.t("audit.edit_case_section_case_hint"),
          <>
            <div className="grid grid-cols-2 gap-x-4">
              <Form.Item name="caseType" label={i18n.t("audit.case_type")}>
                <Select
                  options={isActivationCase ? ACTIVATION_CASE_TYPE_OPTIONS : CASE_TYPE_OPTIONS}
                  placeholder={i18n.t("audit.select_case_type")}
                />
              </Form.Item>
              <Form.Item name="priority" label={i18n.t("support_ticket.priority")}>
                <Select options={PRIORITY_OPTIONS} placeholder={i18n.t("audit.select_priority")} />
              </Form.Item>
            </div>
            <Form.Item name="assignedAgentId" label={i18n.t("support_ticket.assigned_agent")}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={agentOptions}
                loading={agentsLoading}
                notFoundContent={agentsLoading ? <Spin size="small" /> : i18n.t("audit.no_agents_found")}
                placeholder={i18n.t("support_ticket.unassigned")}
              />
            </Form.Item>
          </>,
        )}

        {/* ── Contract holder and supply, held on an activation request ── */}
        {isActivationCase && (
          <>
            {section(
              i18n.t("activation_requests.holder_section"),
              i18n.t("activation_requests.holder_section_hint"),
              <>
                <div className="grid grid-cols-2 gap-x-4">
                  <Form.Item name="contactFirstName" label={i18n.t("settings.first_name")}>
                    <Input maxLength={100} placeholder="Mario" />
                  </Form.Item>
                  <Form.Item name="contactLastName" label={i18n.t("settings.last_name")}>
                    <Input maxLength={100} placeholder="Rossi" />
                  </Form.Item>
                  <Form.Item
                    name="contactEmail"
                    label="Email"
                    rules={[{ type: "email", message: i18n.t("audit.enter_a_valid_email_address") }]}
                  >
                    <Input maxLength={255} placeholder={caseData?.user?.email} />
                  </Form.Item>
                  <Form.Item
                    name="contactPhone"
                    label={i18n.t("client_management.phone")}
                    rules={[
                      {
                        pattern: /^(\+39)?[\d\s.\-/()]{9,}$/,
                        message: i18n.t("activation_requests.phone_invalid"),
                      },
                    ]}
                  >
                    <Input maxLength={20} placeholder="+393331234567" />
                  </Form.Item>
                </div>
                <Form.Item
                  name="contactTaxCode"
                  label={i18n.t("audit.tax_code")}
                  rules={[
                    {
                      validator: (_, value: string) => {
                        const problem = taxIdMessage(value);
                        return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Input maxLength={16} placeholder={caseData?.user?.codiceFiscale ?? "RSSMRA85T10A562S"} />
                </Form.Item>
              </>,
            )}
            {section(
              i18n.t("activation_requests.supply_section"),
              i18n.t("activation_requests.supply_section_hint"),
              <>
                <div className="grid grid-cols-2 gap-x-4">
                  <Form.Item name="energyType" label={i18n.t("service_types.utility_type")}>
                    <Select
                      options={[
                        { value: "electricity", label: i18n.t("home.electricity") },
                        { value: "gas", label: i18n.t("home.gas") },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name="podPdrNumber"
                    label="POD / PDR"
                    normalize={(v: string) => v?.replace(/\s+/g, "").toUpperCase()}
                  >
                    <Input className="font-mono" maxLength={30} />
                  </Form.Item>
                  <Form.Item name="meterNumber" label={i18n.t("audit.meter_number")}>
                    <Input maxLength={50} />
                  </Form.Item>
                  <Form.Item name="supplyContractNumber" label={i18n.t("audit.contract_number")}>
                    <Input maxLength={50} />
                  </Form.Item>
                  <Form.Item name="annualConsumption" label={i18n.t("audit.annual_consumption_est")}>
                    <InputNumber className="w-full!" min={0} precision={2} />
                  </Form.Item>
                  <Form.Item name="fromSupplierId" label={i18n.t("audit.current_supplier")}>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={supplierOptions}
                      loading={suppliersLoading}
                      notFoundContent={suppliersLoading ? <Spin size="small" /> : i18n.t("audit.no_suppliers_found")}
                      placeholder={i18n.t("audit.not_matched_to_a_supplier_record")}
                    />
                  </Form.Item>
                </div>
              </>,
            )}
          </>
        )}

        {/* ── Customer ── */}
        {caseData?.user && !isActivationCase &&
          section(
            i18n.t("audit.edit_case_section_customer"),
            i18n.t("audit.edit_case_section_customer_hint"),
            <>
              <div className="grid grid-cols-2 gap-x-4">
                <Form.Item
                  name={["customer", "firstName"]}
                  label={i18n.t("settings.first_name")}
                  rules={[{ required: true, message: i18n.t("audit.a_first_name_is_required") }]}
                >
                  <Input maxLength={100} placeholder="Mario" />
                </Form.Item>
                <Form.Item
                  name={["customer", "lastName"]}
                  label={i18n.t("settings.last_name")}
                  rules={[{ required: true, message: i18n.t("audit.a_last_name_is_required") }]}
                >
                  <Input maxLength={100} placeholder="Rossi" />
                </Form.Item>
                {/* The address the account signs in with. A company's PEC is a
                    different address and has its own field below — the mailbox
                    that registered a company account is very often somebody's
                    personal one. */}
                <Form.Item
                  name={["customer", "email"]}
                  label="Email"
                  rules={[
                    { required: true, message: i18n.t("audit.an_email_address_is_required") },
                    { type: "email", message: i18n.t("audit.enter_a_valid_email_address") },
                  ]}
                >
                  <Input maxLength={255} placeholder="mario.rossi@email.com" />
                </Form.Item>
                <Form.Item name={["customer", "phone"]} label={i18n.t("client_management.phone")}>
                  <Input maxLength={20} placeholder="+393331234567" />
                </Form.Item>
              </div>
              <div className="grid grid-cols-2 gap-x-4">
                <Form.Item
                  name={["customer", "codiceFiscale"]}
                  // On a business account this is the owner's code, not the
                  // company's — the company is identified by the Partita IVA
                  // beside it, and the supplier asks for both.
                  label={isBusiness ? i18n.t("audit.codice_fiscale_owner") : i18n.t("case_management.detail.codice_fiscale")}
                  // Checked against its own check character, not just its
                  // shape — the account is allowed to hold only a code the
                  // direct debit step will also accept.
                  rules={[
                    {
                      validator: (_, value: string) =>
                        !value || isValidCodiceFiscale(value)
                          ? Promise.resolve()
                          : Promise.reject(new Error(i18n.t("audit.codice_fiscale_invalid"))),
                    },
                  ]}
                >
                  <Input maxLength={16} placeholder="RSSMRA85T10A562S" />
                </Form.Item>
                {isBusiness && (
                  <Form.Item
                    name={["customer", "partitaIva"]}
                    label={i18n.t("case_management.detail.partita_iva")}
                    rules={[
                      {
                        validator: (_, value: string) =>
                          !value || isValidPartitaIva(value)
                            ? Promise.resolve()
                            : Promise.reject(new Error(i18n.t("audit.partita_iva_invalid"))),
                      },
                    ]}
                  >
                    <Input maxLength={11} placeholder="12345678903" />
                  </Form.Item>
                )}
              </div>
              {isBusiness && (
                <div className="grid grid-cols-2 gap-x-4">
                  {/* The name the contract and the SDD mandate are in. The
                      column is NOT NULL, so the field is required here too. */}
                  <Form.Item
                    name={["customer", "companyName"]}
                    label={i18n.t("audit.ragione_sociale")}
                    rules={[{ required: true, message: i18n.t("audit.a_company_name_is_required") }]}
                  >
                    <Input maxLength={255} placeholder="Rossi S.r.l." />
                  </Form.Item>
                  {/* Where the company is reached legally, and where its
                      invoices go when the case carries no explicit address.
                      Optional: cleared, it falls back to the sign-in email. */}
                  <Form.Item
                    name={["customer", "pecEmail"]}
                    label={i18n.t("client_management.pec")}
                    rules={[{ type: "email", message: i18n.t("audit.enter_a_valid_pec_address") }]}
                  >
                    <Input maxLength={255} placeholder="rossi@pec.it" />
                  </Form.Item>
                </div>
              )}
            </>,
          )}

        {/* ── Supply point & bill ── */}
        {bill &&
          section(
            i18n.t("audit.edit_case_section_supply_bill"),
            i18n.t("audit.edit_case_section_supply_bill_hint"),
            <>
              <Form.Item
                name="fromSupplierId"
                label={i18n.t("audit.current_supplier_matched_record")}
                extra={i18n.t("audit.the_supplier_the_customer_is_leaving_the_bill_s_own_printed_name_is_below_this_is_the_company_record_the_switch_is_filed_against")}
              >
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={supplierOptions}
                  loading={suppliersLoading}
                  notFoundContent={suppliersLoading ? <Spin size="small" /> : i18n.t("audit.no_suppliers_found")}
                  placeholder={i18n.t("audit.not_matched_to_a_supplier_record")}
                />
              </Form.Item>
              <BillFields isElectricity={isElectricity} prefix={["bill"]} />
            </>,
          )}

        {/* ── Offer ── */}
        {section(
          i18n.t("audit.edit_case_section_offer"),
          i18n.t("audit.edit_case_section_offer_hint"),
          <Form.Item name="selectedOfferId" label={i18n.t("audit.selected_offer")}>
            <Select
              showSearch
              optionFilterProp="label"
              options={offerOptions}
              loading={offersLoading}
              notFoundContent={offersLoading ? <Spin size="small" /> : i18n.t("audit.no_offers_found")}
              placeholder={i18n.t("audit.select_an_offer")}
            />
          </Form.Item>,
        )}

        {/* ── Payment ── */}
        {section(
          i18n.t("audit.edit_case_section_payment"),
          i18n.t("audit.edit_case_section_payment_hint"),
          <>
            <Form.Item name="paymentMethod" label={i18n.t("client_management.payment_method")}>
              <Select allowClear options={PAYMENT_METHOD_OPTIONS} placeholder={i18n.t("offers_market.select_payment_method")} />
            </Form.Item>
            {/* Kept mounted while hidden so switching method back does not wipe
                the account details the customer gave. */}
            <div className={isDirectDebit ? undefined : "hidden"}>
              <Form.Item name="iban" label="IBAN">
                <Input maxLength={34} placeholder="IT60X0542811101000000123456" />
              </Form.Item>
              <Checkbox
                className="mb-4"
                checked={ibanSame === true}
                onChange={(e) => setIbanSame(e.target.checked)}
              >
                {i18n.t("audit.the_account_belongs_to_the_contract_holder")}
              </Checkbox>
              <div className="grid grid-cols-3 gap-x-4">
                <Form.Item name="ibanHolderFirstName" label={i18n.t("audit.holder_first_name")}>
                  <Input maxLength={100} placeholder="Mario" />
                </Form.Item>
                <Form.Item name="ibanHolderLastName" label={i18n.t("audit.holder_last_name")}>
                  <Input maxLength={100} placeholder="Rossi" />
                </Form.Item>
                <Form.Item
                  name="ibanHolderTaxCode"
                  label={i18n.t("audit.holder_tax_code_vat")}
                  // Either form on either kind of account, whoever holds the
                  // IBAN — matching the app and the API, which only check
                  // formal validity.
                  rules={[
                    {
                      validator: (_, value: string) => {
                        // One that fails only on its check character is nearly
                        // right, so the message names that rather than
                        // "invalid" — retyping is not the fix.
                        // Hidden unless the method is direct debit — a stale
                        // code there must not block a save it plays no part in.
                        if (!isDirectDebit) return Promise.resolve();
                        const problem = taxIdMessage(value);
                        return problem
                          ? Promise.reject(new Error(problem))
                          : Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Input maxLength={16} placeholder="RSSMRA85T10A562S" />
                </Form.Item>
              </div>
              <p className="-mt-2 mb-2 text-xs text-slate-400">
                {i18n.t("audit.the_app_records_the_holder_on_every_direct_debit_including_the_customer_s_own_account_blank_holder_fields_mean_the_case_predates_that")}
              </p>
            </div>
          </>,
        )}

        {/* ── Invoicing ── */}
        {section(
          i18n.t("audit.edit_case_section_invoicing"),
          i18n.t("audit.edit_case_section_invoicing_hint"),
          <>
            <Form.Item name="invoiceDelivery" label={i18n.t("audit.invoice_delivery")}>
              <Select
                allowClear
                options={INVOICE_DELIVERY_OPTIONS}
                placeholder={i18n.t("audit.select_invoice_delivery")}
              />
            </Form.Item>
            <div className={isPaper ? "hidden" : undefined}>
              <Form.Item
                name="invoiceEmail"
                label={i18n.t("audit.invoice_email")}
                // Hidden on paper delivery, so it is only checked while shown.
                rules={
                  isPaper
                    ? undefined
                    : [{ type: "email", message: i18n.t("audit.enter_a_valid_email_address") }]
                }
              >
                <Input maxLength={255} placeholder={i18n.t("audit.defaults_to_the_account_email")} />
              </Form.Item>
            </div>
          </>,
        )}

        {/* ── Supply address ── */}
        {section(
          i18n.t("audit.edit_case_section_supply_address"),
          i18n.t("audit.edit_case_section_supply_address_hint"),
          addressBlock("supply"),
        )}

        {/* ── Residence, or the registered office on a business case ── */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-1">
            {isBusiness ? i18n.t("audit.registered_office") : i18n.t("audit.residential_address")}
          </h4>
          <p className="text-xs text-slate-400 mb-2">
            {isBusiness ? i18n.t("audit.registered_office_help") : i18n.t("audit.residential_address_help")}
          </p>
          <Checkbox
            checked={residentialSame}
            onChange={(e) => {
              setResidentialSame(e.target.checked);
              if (e.target.checked) mirrorSupply("residential");
            }}
            className="mb-3"
          >
            {i18n.t("audit.same_as_supply_address")}
          </Checkbox>
          {addressBlock("residential", residentialSame)}
        </div>

        {/* ── Shipping ── */}
        <div className="mb-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-1">{i18n.t("audit.shipping_address")}</h4>
          <p className="text-xs text-slate-400 mb-2">{i18n.t("audit.where_paper_invoices_are_posted")}</p>
          {!isPaper && (
            <Alert
              type="info"
              showIcon
              className="mb-3"
              message={i18n.t("audit.this_case_receives_digital_invoices_so_no_shipping_address_is_used_anything_entered_here_is_stored_but_not_shown_on_the_case")}
            />
          )}
          <Checkbox
            checked={shippingSame}
            onChange={(e) => {
              setShippingSame(e.target.checked);
              if (e.target.checked) mirrorSupply("shipping");
            }}
            className="mb-3"
          >
            {i18n.t("audit.ships_to_supply_address")}
          </Checkbox>
          {addressBlock("shipping", shippingSame)}
        </div>

        {/* ── Contract dates ── */}
        {section(
          i18n.t("audit.edit_case_section_contract_dates"),
          i18n.t("audit.edit_case_section_contract_dates_hint"),
          <div className="grid grid-cols-3 gap-x-4">
            <Form.Item name="contractSentAt" label={i18n.t("audit.contract_sent_on")}>
              <DatePicker className="w-full!" format={DATE_FORMAT} allowClear />
            </Form.Item>
            <Form.Item name="activationDate" label={i18n.t("audit.activation_date_2")}>
              <DatePicker
                className="w-full!"
                format={DATE_FORMAT}
                allowClear
                // Clearing an expiry that no longer follows the new activation
                // date beats letting the server refuse the whole save for it.
                onChange={(d) => {
                  if (d && expiryDate && !expiryDate.isAfter(d, "day")) {
                    form.setFieldValue("expiryDate", null);
                  }
                }}
              />
            </Form.Item>
            <Form.Item name="expiryDate" label={i18n.t("audit.expiry_date_2")}>
              <DatePicker
                className="w-full!"
                format={DATE_FORMAT}
                allowClear
                disabledDate={(d) => !!activationDate && !d.isAfter(activationDate, "day")}
              />
            </Form.Item>
          </div>,
        )}

        {/* ── Commercial & SLA ── */}
        {section(
          i18n.t("audit.edit_case_section_commercial_sla"),
          i18n.t("audit.edit_case_section_commercial_sla_hint"),
          <div className="grid grid-cols-3 gap-x-4">
            <Form.Item name="estimatedAnnualValue" label={i18n.t("audit.estimated_annual_value")}>
              <InputNumber className="w-full!" min={0} precision={2} placeholder="1140.00" />
            </Form.Item>
            <Form.Item name="slaDaysTotal" label={i18n.t("audit.sla_days")}>
              <InputNumber className="w-full!" min={0} precision={0} placeholder="30" />
            </Form.Item>
            <Form.Item name="slaDeadline" label={i18n.t("audit.sla_deadline")}>
              <DatePicker className="w-full!" format={DATE_FORMAT} allowClear />
            </Form.Item>
          </div>,
        )}

        {/* ── Notes ── */}
        {section(
          i18n.t("audit.edit_case_section_notes"),
          i18n.t("audit.edit_case_section_notes_hint"),
          <>
            <Form.Item name="notes" label={i18n.t("audit.customer_visible_notes")}>
              <Input.TextArea rows={3} placeholder={i18n.t("audit.your_documents_have_been_received_and_are_under_review")} />
            </Form.Item>
            <Form.Item name="internalNotes" label={i18n.t("audit.internal_notes")}>
              <Input.TextArea rows={3} placeholder={i18n.t("audit.verified_pod_via_supplier_portal")} />
            </Form.Item>
          </>,
        )}
      </Form>
    </Modal>
  );
}
