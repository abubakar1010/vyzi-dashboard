import { getLocale } from "../../utils/format";
import { useCallback, useMemo, useState } from "react";
import { Avatar, Empty, Input, Spin, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { FiArrowLeft, FiEye, FiSearch } from "react-icons/fi";
import { LuCircleCheckBig, LuFlame, LuZap } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import {
  useGetAdminDashboardQuery,
  useGetPriorityTasksQuery,
  type PriorityTaskCategory,
  type PriorityTaskItem,
} from "../../redux/features/Dashboard/dashboardApi";
import {
  PRIORITY_TASK_UI,
  getPriorityTaskUi,
} from "../../constants/priorityTasks";
import { getBillStatusConfig } from "../../constants/billStatus";
import { debounce } from "../../utils/debounce";
import { formatMoney } from "../../utils/format";

const PAGE_SIZE = 20;

/** Uniform placeholder for a field the pipeline has no value for yet. */
const Missing = ({ label }: { label: string }) => (
  <span className="text-slate-400 italic text-xs">{label}</span>
);

/**
 * How long something has been waiting, coloured by how much that matters.
 *
 * A week is the same threshold the server uses to decide an unanswered offer
 * has become a phone call, so the two agree about when patience runs out.
 */
const waitingTone = (days: number) =>
  days >= 7
    ? "text-red-600"
    : days >= 3
      ? "text-amber-600"
      : "text-slate-500";

/**
 * `YYYY-MM-DD` to `DD/MM/YYYY`, by hand.
 *
 * A contract expiry is a calendar day, not an instant. Running it through
 * `Date` would read it as UTC midnight and render the day before for any admin
 * sitting west of Greenwich.
 */
const formatDueDate = (isoDay: string) => {
  const [year, month, day] = isoDay.split("-");
  return day && month && year ? `${day}/${month}/${year}` : isoDay;
};

const PriorityTasks = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // The category lives in the URL so a bucket opened from the dashboard card is
  // a link the admin can bookmark, share and come back to. A hand-typed value
  // the API would reject falls back to "everything" rather than to an error.
  const rawCategory = searchParams.get("category");
  const category =
    rawCategory && rawCategory in PRIORITY_TASK_UI
      ? (rawCategory as PriorityTaskCategory)
      : undefined;

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Served from cache when the admin arrived from the dashboard — the card has
  // already asked for it — and the counts are the unfiltered ones either way.
  const { data: dashboard, isLoading: countsLoading } =
    useGetAdminDashboardQuery();

  const { data, isLoading, isFetching } = useGetPriorityTasksQuery({
    category,
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  const tasks = data?.data || [];
  const meta = data?.meta;

  const total = dashboard?.priorityTasks?.total ?? 0;
  const categories = useMemo(
    () => (dashboard?.priorityTasks?.categories ?? []).filter((c) => c.count > 0),
    [dashboard],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setSearch(value);
      setPage(1);
    }, 500),
    [],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    debouncedSearch(value);
  };

  const selectCategory = (next?: PriorityTaskCategory) => {
    setPage(1);
    setSearchParams(next ? { category: next } : {}, { replace: true });
  };

  /**
   * A task is addressed by its bill everywhere else in the admin panel. A
   * renewal on an activation request has no bill, so it opens by its case.
   */
  const taskRoute = (task: PriorityTaskItem): string | null => {
    if (task.billId) return `/case-management/${task.billId}`;
    if (task.caseId) return `/activation-requests/${task.caseId}`;
    return null;
  };
  const openTask = (task: PriorityTaskItem) => {
    const route = taskRoute(task);
    if (route) navigate(route);
  };

  const columns: ColumnsType<PriorityTaskItem> = [
    {
      title: t("priority_tasks.col_customer"),
      key: "customer",
      width: 220,
      render: (_, record) => {
        const name = [record.customer?.firstName, record.customer?.lastName]
          .filter(Boolean)
          .join(" ");
        if (!name) return <Missing label={t("priority_tasks.no_customer")} />;
        return (
          <div className="flex items-center gap-2.5">
            <Avatar
              size={28}
              className="bg-indigo-100 text-indigo-600 font-semibold text-[10px]"
            >
              {record.customer?.firstName?.[0]}
              {record.customer?.lastName?.[0]}
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-700">{name}</p>
              <p className="truncate text-[11px] text-slate-400">
                {record.customer?.phone || record.customer?.email}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      title: t("priority_tasks.col_task"),
      key: "category",
      width: 190,
      render: (_, record) => {
        const ui = getPriorityTaskUi(record.category);
        const Icon = ui.icon;
        return (
          <Tag
            color={ui.tagColor}
            className="rounded-full! px-3! py-0.5! text-xs! font-semibold! border-0!"
          >
            <Icon className="mr-1 inline h-3 w-3" />
            {t(ui.labelKey)}
          </Tag>
        );
      },
    },
    {
      title: t("priority_tasks.col_type"),
      key: "billType",
      width: 100,
      align: "center",
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
                <LuZap className="mr-1 inline h-3 w-3" />
              ) : (
                <LuFlame className="mr-1 inline h-3 w-3" />
              )
            }
          >
            {record.billType}
          </Tag>
        ) : (
          <Missing label={t("priority_tasks.unknown")} />
        ),
    },
    {
      title: t("priority_tasks.col_pod_pdr"),
      key: "podPdr",
      width: 165,
      responsive: ["lg"],
      render: (_, record) =>
        record.podPdr ? (
          <span className="font-mono text-xs font-medium text-slate-700">
            {record.podPdr}
          </span>
        ) : (
          <Missing label={t("priority_tasks.not_detected")} />
        ),
    },
    {
      title: t("priority_tasks.col_supplier"),
      key: "supplier",
      width: 140,
      responsive: ["xl"],
      render: (_, record) =>
        record.supplierName ? (
          <span className="font-medium text-slate-700">
            {record.supplierName}
          </span>
        ) : (
          <Missing label={t("priority_tasks.not_detected")} />
        ),
    },
    {
      title: t("priority_tasks.col_amount"),
      key: "amount",
      width: 110,
      align: "right",
      responsive: ["xl"],
      render: (_, record) =>
        record.amount != null ? (
          <span className="font-bold text-slate-800">
            {formatMoney(record.amount)}
          </span>
        ) : (
          <Missing label="—" />
        ),
    },
    {
      title: t("priority_tasks.col_status"),
      key: "status",
      width: 150,
      render: (_, record) => {
        const cfg = getBillStatusConfig(record.status);
        return (
          <Tag
            color={cfg.color}
            className="rounded-full! px-3! py-0.5! text-xs! font-semibold! border-0!"
          >
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: t("priority_tasks.col_waiting"),
      key: "waiting",
      width: 150,
      render: (_, record) => {
        // Renewals are the one bucket measured forwards: what matters is when
        // the contract runs out, not how long the case has existed.
        if (record.dueDate != null && record.daysUntilDue != null) {
          const days = record.daysUntilDue;
          const label =
            days < 0
              ? t("priority_tasks.expired_days_ago", { count: Math.abs(days) })
              : days === 0
                ? t("priority_tasks.expires_today")
                : t("priority_tasks.expires_in_days", { count: days });
          return (
            <Tooltip title={formatDueDate(record.dueDate)}>
              <span
                className={`text-xs font-semibold ${
                  days <= 7 ? "text-red-600" : "text-amber-600"
                }`}
              >
                {label}
              </span>
            </Tooltip>
          );
        }
        return (
          <Tooltip
            title={new Date(record.waitingSince).toLocaleString(getLocale())}
          >
            <span
              className={`text-xs font-semibold ${waitingTone(record.daysWaiting)}`}
            >
              {t("priority_tasks.waiting_days", { count: record.daysWaiting })}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t("priority_tasks.col_actions"),
      key: "actions",
      width: 100,
      align: "center",
      render: (_, record) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openTask(record);
          }}
          disabled={!taskRoute(record)}
          className="flex items-center gap-1 font-medium text-sm text-rose-500 hover:text-rose-600 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <FiEye className="h-4 w-4" />
          {t("priority_tasks.open")}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Page Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <FiArrowLeft className="h-4 w-4" />
          {t("priority_tasks.back_to_dashboard")}
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          {t("dashboard.priority_tasks")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("priority_tasks.subtitle")}
        </p>
      </div>

      {/* Buckets — the same counts the dashboard card shows, as filters */}
      {countsLoading ? (
        <div className="flex items-center gap-3 py-2">
          <Spin size="small" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => selectCategory(undefined)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              !category
                ? "border-[#7061ED] bg-[#7061ED] text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {t("priority_tasks.all_tasks")}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                !category ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {total}
            </span>
          </button>

          {categories.map((c) => {
            const ui = getPriorityTaskUi(c.key);
            const Icon = ui.icon;
            const active = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => selectCategory(c.key)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-[#7061ED] bg-[#7061ED] text-white"
                    : `${ui.border} ${ui.bg} text-slate-700 hover:brightness-95`
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${active ? "text-white" : ui.iconColor}`}
                />
                {t(ui.labelKey)}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    active ? "bg-white/25 text-white" : "bg-white/80 text-slate-700"
                  }`}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Table Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-5">
          <div className="min-w-[280px] flex-1">
            <Input
              allowClear
              value={searchInput}
              onChange={handleSearchChange}
              placeholder={t("priority_tasks.search_placeholder")}
              prefix={<FiSearch className="mr-2 text-slate-400" />}
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          {/* The chip counts stay unfiltered on purpose — they are bucket
              sizes — so the result count is spelled out next to the search. */}
          <p className="text-sm text-slate-500">
            {t("priority_tasks.results", { count: meta?.total ?? 0 })}
            {category
              ? ` · ${t("priority_tasks.showing_bucket", {
                  category: t(getPriorityTaskUi(category).labelKey),
                })}`
              : ""}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spin size="large" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-20">
            <Empty
              image={
                <LuCircleCheckBig className="mx-auto h-12 w-12 text-emerald-500" />
              }
              description={
                <span className="text-slate-500">
                  {search
                    ? t("priority_tasks.no_matches")
                    : t("priority_tasks.no_tasks")}
                </span>
              }
            />
          </div>
        ) : (
          <Table<PriorityTaskItem>
            rowKey="id"
            columns={columns}
            dataSource={tasks}
            scroll={{ x: 1150 }}
            loading={isFetching && !isLoading}
            onRow={(record) => ({
              onClick: () => openTask(record),
              className: taskRoute(record) ? "cursor-pointer" : "",
            })}
            pagination={{
              current: meta?.page || 1,
              pageSize: meta?.limit || PAGE_SIZE,
              total: meta?.total || 0,
              onChange: (next) => setPage(next),
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

export default PriorityTasks;
