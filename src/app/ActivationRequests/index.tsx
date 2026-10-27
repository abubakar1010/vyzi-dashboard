import { Empty, Input, Select, Spin, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiEye, FiSearch } from "react-icons/fi";
import { LuFlame, LuZap } from "react-icons/lu";
import { useNavigate } from "react-router";
import {
  ACTIVATION_REQUEST_CASE_TYPES,
  ACTIVATION_REQUEST_STATUSES,
  ACTIVATION_REQUEST_STATUS_COLOR,
  type ActivationRequestStatus,
} from "../../constants/activationRequest";
import {
  useGetCasesQuery,
  type ICase,
  type ICaseQuery,
} from "../../redux/features/Cases/caseApi";
import { debounce } from "../../utils/debounce";
import { getLocale } from "../../utils/format";

/**
 * "Richieste di attivazione": customers who asked from the app to be called
 * back about switching a supply on. Kept apart from Case Management, which
 * lists bills — these requests have none.
 */
const ActivationRequests = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [queryParams, setQueryParams] = useState<ICaseQuery>({
    page: 1,
    limit: 20,
    caseType: [...ACTIVATION_REQUEST_CASE_TYPES],
  });
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching } = useGetCasesQuery(queryParams);
  const requests = data?.data || [];
  const meta = data?.meta;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setQueryParams((prev) => ({ ...prev, page: 1, search: value || undefined }));
    }, 500),
    [],
  );

  const setFilter = (patch: Partial<ICaseQuery>) =>
    setQueryParams((prev) => ({ ...prev, ...patch, page: 1 }));

  const contactName = (record: ICase) =>
    [record.contactFirstName, record.contactLastName].filter(Boolean).join(" ") ||
    [record.user?.firstName, record.user?.lastName].filter(Boolean).join(" ");

  const columns: ColumnsType<ICase> = [
    {
      title: t("activation_requests.case_number"),
      key: "caseNumber",
      width: 170,
      render: (_, record) => (
        <span className="font-mono text-xs font-medium text-slate-700">
          {record.caseNumber || "—"}
        </span>
      ),
    },
    {
      title: t("activation_requests.service"),
      key: "energyType",
      width: 100,
      align: "center",
      render: (_, record) =>
        record.energyType ? (
          <Tag
            className={`border-0 rounded font-bold text-[10px] px-2 py-0 uppercase ${
              record.energyType === "electricity"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-blue-50 text-blue-600"
            }`}
            icon={
              record.energyType === "electricity" ? (
                <LuZap className="inline mr-1 h-3 w-3" />
              ) : (
                <LuFlame className="inline mr-1 h-3 w-3" />
              )
            }
          >
            {record.energyType === "electricity" ? t("home.electricity") : t("home.gas")}
          </Tag>
        ) : (
          "—"
        ),
    },
    {
      title: t("activation_requests.request_type"),
      key: "caseType",
      width: 150,
      render: (_, record) => (
        <span className="text-sm font-medium text-slate-700">
          {t(`activation_requests.types.${record.caseType}`)}
        </span>
      ),
    },
    {
      title: t("activation_requests.contact"),
      key: "contact",
      width: 200,
      render: (_, record) => (
        <div className="leading-tight">
          <div className="font-medium text-slate-700">{contactName(record) || "—"}</div>
          {record.contactPhone && (
            <a
              href={`tel:${record.contactPhone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-[#7061ED]"
            >
              {record.contactPhone}
            </a>
          )}
        </div>
      ),
    },
    {
      title: t("activation_requests.city"),
      key: "city",
      width: 150,
      render: (_, record) =>
        record.supplyCity ? (
          <span className="text-slate-600">
            {record.supplyCity}
            {record.supplyProvince ? ` (${record.supplyProvince})` : ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: t("activation_requests.requested_on"),
      key: "createdAt",
      width: 120,
      responsive: ["lg"],
      render: (_, record) => (
        <span className="text-xs text-slate-500">
          {new Date(record.createdAt).toLocaleDateString(getLocale())}
        </span>
      ),
    },
    {
      title: t("common.status"),
      key: "status",
      width: 140,
      render: (_, record) => (
        <Tag
          color={ACTIVATION_REQUEST_STATUS_COLOR[record.status as ActivationRequestStatus]}
          className="rounded-full! px-3! py-0.5! text-xs! font-semibold! border-0!"
        >
          {t(`activation_requests.status.${record.status}`, { defaultValue: record.status })}
        </Tag>
      ),
    },
    {
      title: t("common.actions"),
      key: "actions",
      width: 90,
      align: "center",
      render: (_, record) => (
        <button
          type="button"
          onClick={() => navigate(`/activation-requests/${record.id}`)}
          className="flex items-center gap-1 text-rose-500 hover:text-rose-600 font-medium text-sm"
        >
          <FiEye className="h-4 w-4" />
          {t("case_management.details")}
        </button>
      ),
    },
  ];

  const selectClass =
    "[&_.ant-select-selector]:h-11 [&_.ant-select-selector]:rounded-xl [&_.ant-select-selector]:border-slate-200";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t("activation_requests.title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("activation_requests.description")}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-5">
          <div className="flex-1 min-w-[280px]">
            <Input
              allowClear
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                debouncedSearch(e.target.value);
              }}
              placeholder={t("activation_requests.search_placeholder")}
              prefix={<FiSearch className="text-slate-400 mr-2" />}
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <Select
            allowClear
            placeholder={t("activation_requests.service")}
            style={{ height: "44px" }}
            className={`w-36 ${selectClass}`}
            onChange={(value?: string) => setFilter({ energyType: value })}
            options={[
              { value: "electricity", label: t("home.electricity") },
              { value: "gas", label: t("home.gas") },
            ]}
          />
          <Select
            allowClear
            placeholder={t("activation_requests.request_type")}
            style={{ height: "44px" }}
            className={`w-48 ${selectClass}`}
            onChange={(value?: string) =>
              setFilter({ caseType: value ? [value] : [...ACTIVATION_REQUEST_CASE_TYPES] })
            }
            options={ACTIVATION_REQUEST_CASE_TYPES.map((type) => ({
              value: type,
              label: t(`activation_requests.types.${type}`),
            }))}
          />
          <Select
            allowClear
            placeholder={t("common.status")}
            style={{ height: "44px" }}
            className={`w-48 ${selectClass}`}
            onChange={(value?: string) => setFilter({ status: value })}
            options={ACTIVATION_REQUEST_STATUSES.map((status) => ({
              value: status,
              label: t(`activation_requests.status.${status}`),
            }))}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spin size="large" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-24">
            <Empty description={t("activation_requests.empty")} />
          </div>
        ) : (
          <Table<ICase>
            rowKey="id"
            columns={columns}
            dataSource={requests}
            scroll={{ x: 1100 }}
            loading={isFetching && !isLoading}
            onRow={(record) => ({
              onClick: () => navigate(`/activation-requests/${record.id}`),
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
    </div>
  );
};

export default ActivationRequests;
