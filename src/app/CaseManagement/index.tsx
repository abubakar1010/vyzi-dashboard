import { getLocale } from "../../utils/format";
import { Avatar, Input, Segmented, Select, Spin, Empty, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { FiEye, FiSearch } from "react-icons/fi";
import { LuZap, LuFlame } from "react-icons/lu";
import { useNavigate, useSearchParams } from "react-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import ActivationRequests from "../ActivationRequests";
import {
  useGetBillsAdminQuery,
  type IBill,
  type IBillQuery,
} from "../../redux/features/Bills/billApi";
import { debounce } from "../../utils/debounce";
import { formatMoney } from "../../utils/format";
import { getBillStatusConfig } from "../../constants/billStatus";

/** Uniform placeholder for a field OCR could not read off the bill. */
const Missing = ({ label }: { label?: string }) => (
  <span className="text-slate-400 italic text-xs">{label || i18n.t("common.not_detected")}</span>
);

const CaseManagement = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [queryParams, setQueryParams] = useState<IBillQuery>({ page: 1, limit: 20 });
  const [search, setSearch] = useState("");
  const [billTypeFilter, setBillTypeFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const [searchParams, setSearchParams] = useSearchParams();
  const showActivations = searchParams.get("tab") === "activations";

  const { data, isLoading, isFetching } = useGetBillsAdminQuery(queryParams, {
    skip: showActivations,
  });

  const bills = data?.data || [];
  const meta = data?.meta;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setQueryParams((prev) => ({ ...prev, page: 1, search: value || undefined }));
    }, 500),
    [],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    debouncedSearch(value);
  };

  const handleBillTypeFilter = (value: string | undefined) => {
    setBillTypeFilter(value);
    setQueryParams((prev) => ({ ...prev, page: 1, billType: value }));
  };

  const handleStatusFilter = (value: string | undefined) => {
    setStatusFilter(value);
    setQueryParams((prev) => ({ ...prev, page: 1, status: value }));
  };

  const columns: ColumnsType<IBill> = [
    {
      title: t("case_management.type"),
      key: "billType",
      width: 100,
      render: (_, record) =>
        record.billType ? (
          <Tag
            className={`border-0 rounded font-bold text-[10px] px-2 py-0 uppercase ${
              record.billType === "electricity"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-blue-50 text-blue-600"
            }`}
            icon={
              record.billType === "electricity" ? (
                <LuZap className="inline mr-1 h-3 w-3" />
              ) : (
                <LuFlame className="inline mr-1 h-3 w-3" />
              )
            }
          >
            {record.billType === "electricity" ? t("home.electricity") : t("home.gas")}
          </Tag>
        ) : (
          <Missing label={i18n.t("common.unknown")} />
        ),
      align: "center",
    },
    {
      title: t("case_management.customer"),
      key: "customer",
      width: 180,
      render: (_, record) => {
        // Email-uploaded bills sit unassociated until an admin links an account.
        const name = [record.user?.firstName, record.user?.lastName]
          .filter(Boolean)
          .join(" ");
        if (!name) return <Missing label={i18n.t("common.not_linked")} />;
        return (
          <div className="flex items-center gap-2.5">
            <Avatar
              size={28}
              className="bg-indigo-100 text-indigo-600 font-semibold text-[10px]"
            >
              {record.user?.firstName?.[0]}
              {record.user?.lastName?.[0]}
            </Avatar>
            <span className="font-medium text-slate-700">{name}</span>
          </div>
        );
      },
    },
    {
      title: t("case_management.pod_pdr"),
      key: "pod_pdr",
      width: 170,
      render: (_, record) => {
        const code = record.podNumber || record.pdrNumber;
        return code ? (
          <span className="font-medium text-slate-700 text-xs font-mono">{code}</span>
        ) : (
          <Missing />
        );
      },
    },
    {
      title: t("case_management.supplier"),
      key: "supplier",
      width: 130,
      render: (_, record) => {
        // The name OCR read off the bill is the source of truth here — a linked
        // supplier record is optional and often absent.
        const supplier =
          record.supplierName ||
          record.supplier?.name ||
          (record.rawAnalysisData?.ocrSupplierName as string | undefined);
        return supplier ? (
          <span className="text-slate-700 font-medium">{supplier}</span>
        ) : (
          <Missing />
        );
      },
    },
    {
      title: t("client_management.bill_amount"),
      key: "totalAmount",
      width: 110,
      render: (_, record) =>
        record.totalAmount != null ? (
          <span className="font-bold text-slate-800">{formatMoney(record.totalAmount)}</span>
        ) : (
          <Missing />
        ),
      align: "right",
    },
    {
      title: t("client_management.bill_period"),
      key: "period",
      width: 150,
      responsive: ["lg"],
      render: (_, record) => {
        if (!record.billingPeriodStart) return <Missing />;
        const start = new Date(record.billingPeriodStart).toLocaleDateString(getLocale());
        // Half-read periods are common — show the one date rather than a stray dash.
        const end = record.billingPeriodEnd
          ? new Date(record.billingPeriodEnd).toLocaleDateString(getLocale())
          : null;
        return (
          <span className="text-slate-500 text-xs">{end ? `${start} - ${end}` : start}</span>
        );
      },
    },
    {
      title: t("common.status"),
      key: "status",
      width: 130,
      render: (_: unknown, record: IBill) => {
        if (!record.status) return <Missing label={i18n.t("common.unknown")} />;
        const cfg = getBillStatusConfig(record.status);
        return (
          <Tag
            color={cfg.color}
            className="rounded-full! px-3! py-0.5! text-xs! font-semibold! border-0!"
          >
            {t(`case_management.status.${record.status}`, { defaultValue: cfg.label })}
          </Tag>
        );
      },
    },
    {
      title: t("common.actions"),
      key: "actions",
      width: 80,
      align: "center",
      render: (_, record) => (
        <button
          type="button"
          onClick={() => navigate(`/case-management/${record.id}`)}
          className="flex items-center gap-1 text-rose-500 hover:text-rose-600 font-medium text-sm"
        >
          <FiEye className="h-4 w-4" />
          {t("case_management.details")}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t("case_management.title")}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t("case_management.description")}
        </p>
      </div>

      <Segmented
        value={showActivations ? "activations" : "bills"}
        onChange={(value) =>
          setSearchParams(value === "activations" ? { tab: "activations" } : {}, { replace: true })
        }
        options={[
          { value: "bills", label: t("activation_requests.tab_bills") },
          { value: "activations", label: t("activation_requests.tab_activations") },
        ]}
      />

      {showActivations && <ActivationRequests embedded />}

      {/* Table Card */}
      {!showActivations && (
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-3 p-5">
          <div className="flex-1 min-w-[280px]">
            <Input
              allowClear
              value={search}
              onChange={handleSearchChange}
              placeholder={t("case_management.search_placeholder")}
              prefix={<FiSearch className="text-slate-400 mr-2" />}
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <Select
            allowClear
            placeholder={t("home.bill_type")}
            value={billTypeFilter}
            onChange={handleBillTypeFilter}
            style={{ height: "44px" }}
            className="w-36 [&_.ant-select-selector]:h-11 [&_.ant-select-selector]:rounded-xl [&_.ant-select-selector]:border-slate-200"
            options={[
              { value: "electricity", label: t("home.electricity") },
              { value: "gas", label: t("home.gas") },
            ]}
          />
          <Select
            allowClear
            placeholder={t("common.status")}
            value={statusFilter}
            onChange={handleStatusFilter}
            style={{ height: "44px" }}
            className="w-48 [&_.ant-select-selector]:h-11 [&_.ant-select-selector]:rounded-xl [&_.ant-select-selector]:border-slate-200"
            options={[
              { value: "uploaded", label: t("case_management.status.uploaded") },
              { value: "analyzing", label: t("case_management.status.analyzing") },
              { value: "analyzed", label: t("case_management.status.analyzed") },
              { value: "verification_review", label: t("case_management.status.verification_review") },
              { value: "verification_required", label: t("case_management.status.verification_required") },
              { value: "verified", label: t("case_management.status.verified") },
              { value: "offer_sent", label: t("case_management.status.offer_sent") },
              { value: "offer_accepted", label: t("case_management.status.offer_accepted") },
              { value: "contract_sent", label: t("case_management.status.contract_sent") },
              { value: "awaiting_activation", label: t("case_management.status.awaiting_activation") },
              { value: "activated", label: t("case_management.status.activated") },
              { value: "cancelled", label: t("case_management.status.cancelled") },
              { value: "error", label: t("case_management.status.error") },
            ]}
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spin size="large" />
          </div>
        ) : bills.length === 0 ? (
          <div className="py-24">
            <Empty description={t("common.no_data")} />
          </div>
        ) : (
          <Table<IBill>
            rowKey="id"
            columns={columns}
            dataSource={bills}
            scroll={{ x: 1050 }}
            loading={isFetching && !isLoading}
            onRow={(record) => ({
              onClick: () => navigate(`/case-management/${record.id}`),
              className: "cursor-pointer",
            })}
            pagination={{
              current: meta?.page || 1,
              pageSize: meta?.limit || 20,
              total: meta?.total || 0,
              onChange: (page) => setQueryParams((prev) => ({ ...prev, page })),
              showSizeChanger: false,
              className: "p-4 mt-0 border-t border-slate-100",
            }}
            className="[&_.ant-table-thead_th]:bg-slate-50/80 [&_.ant-table-thead_th]:text-[#7061ED] [&_.ant-table-thead_th]:text-[11px] [&_.ant-table-thead_th]:font-bold [&_.ant-table-thead_th]:uppercase [&_.ant-table-thead_th]:tracking-wider [&_.ant-table-thead_th]:py-3.5 [&_.ant-table-row]:hover:bg-slate-50/30 [&_.ant-table-cell]:py-4 [&_.ant-table-cell]:border-slate-100"
          />
        )}
      </div>
      )}
    </div>
  );
};

export default CaseManagement;
