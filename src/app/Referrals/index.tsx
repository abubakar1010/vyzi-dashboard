import { getLocale } from "../../utils/format";
import { useState } from "react";
import { Button, Card, Dropdown, Empty, Input, InputNumber, Modal, Select, Spin, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { FiClock, FiDollarSign, FiSearch, FiSettings, FiUpload, FiUsers } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import {
  useGetReferralsQuery,
  useGetReferralStatsQuery,
  useUpdateReferralStatusMutation,
  type IReferral,
} from "../../redux/features/Referrals/referralApi";
import { debounce } from "../../utils/debounce";
import { formatMoney } from "../../utils/format";
import { sweetAlertConfirmation } from "../../lib/helpers/sweetAlertConfirmation";

const statusColor: Record<string, string> = {
  pending: "bg-slate-500",
  registered: "bg-blue-500",
  qualified: "bg-amber-500",
  rewarded: "bg-emerald-500",
  expired: "bg-red-400",
};

const statusTransitions: Record<string, { label: string; value: string; danger?: boolean }[]> = {
  pending: [
    { label: "mark_registered", value: "registered" },
    { label: "expire", value: "expired", danger: true },
  ],
  registered: [
    { label: "mark_qualified", value: "qualified" },
    { label: "expire", value: "expired", danger: true },
  ],
  qualified: [
    { label: "mark_paid", value: "rewarded" },
    { label: "expire", value: "expired", danger: true },
  ],
};

const Referrals = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  // Reward modal state
  const [rewardModalOpen, setRewardModalOpen] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<IReferral | null>(null);
  const [rewardAmount, setRewardAmount] = useState(10);
  const [friendRewardAmount, setFriendRewardAmount] = useState(10);

  const { data: stats, isLoading: isStatsLoading, isError: isStatsError } = useGetReferralStatsQuery();
  const { data, isLoading } = useGetReferralsQuery({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter,
  });
  const [updateStatus] = useUpdateReferralStatusMutation();

  const referrals = data?.data || [];
  const meta = data?.meta;
  // The amounts the app promises; set on the server, pre-filled when paying.
  const rewardDefaults = stats?.rewardDefaults ?? { referrerAmount: 10, friendAmount: 10 };

  const handleSearch = debounce((value: string) => {
    setSearch(value);
    setPage(1);
  }, 400);

  const handleStatusUpdate = async (id: string, status: string, amount?: number) => {
    try {
      await updateStatus({ id, status, ...(amount != null && { rewardAmount: amount }) }).unwrap();
      message.success(t("referrals.status_updated"));
    } catch {
      message.error(t("referrals.failed_to_update"));
    }
  };

  const handleExportCSV = () => {
    if (!referrals.length) return;
    const headers = ["csv_referrer", "csv_referrer_email", "csv_invited", "csv_invited_email", "csv_status", "csv_reward", "csv_friend_reward", "csv_date"].map((key) => t(`referrals.${key}`));
    const rows = referrals.map((r) => [
      r.referrer ? `${r.referrer.firstName} ${r.referrer.lastName}` : "",
      r.referrer?.email || "",
      r.referredUser ? `${r.referredUser.firstName} ${r.referredUser.lastName}` : r.referredEmail || "",
      r.referredUser?.email || r.referredEmail || "",
      r.status,
      r.rewardAmount?.toString() || "",
      r.friendRewardAmount?.toString() || "",
      new Date(r.createdAt).toLocaleDateString(getLocale()),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `referrals_export_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<IReferral> = [
    {
      title: t("referrals.referrer"),
      key: "referrer",
      render: (_, record) => (
        <div>
          <p className="font-semibold text-slate-700">
            {record.referrer ? `${record.referrer.firstName} ${record.referrer.lastName}` : "—"}
          </p>
          <p className="text-xs text-slate-400">{record.referrer?.email}</p>
        </div>
      ),
    },
    {
      title: t("referrals.code"),
      dataIndex: "referralCode",
      key: "referralCode",
      render: (code: string) => (
        <span className="font-mono text-xs text-slate-600">{code}</span>
      ),
    },
    {
      title: t("referrals.invited"),
      key: "invited",
      render: (_, record) => (
        <div>
          <p className="font-semibold text-slate-700">
            {record.referredUser
              ? `${record.referredUser.firstName} ${record.referredUser.lastName}`
              : record.referredEmail || "—"}
          </p>
          <p className="text-xs text-slate-400">{record.referredUser?.email || record.referredEmail}</p>
        </div>
      ),
    },
    {
      title: t("referrals.date"),
      key: "date",
      render: (_, record) => (
        <span className="inline-flex items-center gap-1 text-slate-500">
          <FiClock className="h-3.5 w-3.5" />
          {new Date(record.createdAt).toLocaleDateString(getLocale())}
        </span>
      ),
    },
    {
      title: t("referrals.reward"),
      key: "reward",
      render: (_, record) => (
        <div>
          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
            <FiDollarSign className="h-3.5 w-3.5 text-amber-500" />
            {formatMoney(record.rewardAmount)}
          </span>
          {record.friendRewardAmount != null && (
            <p className="text-xs text-slate-400">
              {t("referrals.friend_reward_short", { amount: formatMoney(record.friendRewardAmount) })}
            </p>
          )}
        </div>
      ),
    },
    {
      title: t("common.status"),
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag
          className={`rounded-full border-0 px-2.5 py-0 text-[10px] font-semibold text-white capitalize ${statusColor[status] || "bg-slate-400"}`}
        >
          {t(`referrals.${status}`)}
        </Tag>
      ),
    },
    {
      title: t("referrals.actions"),
      key: "actions",
      render: (_, record) => {
        const transitions = statusTransitions[record.status];
        if (!transitions?.length) return null;

        const items = transitions.map((tr) => ({
          key: tr.value,
          label: t(`referrals.${tr.label}`),
          danger: tr.danger,
          onClick: () => {
            if (tr.value === "rewarded") {
              setSelectedReferral(record);
              setRewardAmount(rewardDefaults.referrerAmount);
              setFriendRewardAmount(rewardDefaults.friendAmount);
              setRewardModalOpen(true);
            } else if (tr.value === "expired") {
              sweetAlertConfirmation({
                func: () => handleStatusUpdate(record.id, "expired"),
                title: t("referrals.confirm_expire_title"),
                object: t("referrals.confirm_expire_text"),
                okay: t("referrals.confirm"),
              });
            } else {
              handleStatusUpdate(record.id, tr.value);
            }
          },
        }));

        return (
          <Dropdown menu={{ items }} trigger={["click"]}>
            <Button size="small" className="rounded-lg border-slate-200 text-xs font-medium">
              {t("referrals.actions")} ▾
            </Button>
          </Dropdown>
        );
      },
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 border-b border-cborder/45 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-brand">{t("referrals.title")}</h2>
          <p className="text-sm text-owngray">{t("referrals.description")}</p>
        </div>
        <Button
          icon={<FiUpload className="h-4 w-4" />}
          onClick={handleExportCSV}
          className="h-10 rounded-lg border-slate-200 px-4 font-medium"
        >
          {t("referrals.export_report")}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isStatsLoading ? (
          <div className="col-span-full flex items-center justify-center py-8">
            <Spin size="large" />
          </div>
        ) : isStatsError ? (
          <div className="col-span-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {t("referrals.statistics_load_failed")}
          </div>
        ) : (
          [
            { title: t("referrals.total_referrals"), value: String(stats?.totalReferrals || 0), icon: <FiUsers className="h-4 w-4" /> },
            { title: t("referrals.qualified"), value: String(stats?.qualified || 0), icon: <FiUsers className="h-4 w-4" /> },
            { title: t("referrals.rewarded"), value: String(stats?.rewarded || 0), icon: <FiUsers className="h-4 w-4" /> },
            {
              title: t("referrals.total_paid"),
              // Both halves of each referral: the referrer's and the friend's.
              value: formatMoney((stats?.totalRewardsPaid || 0) + (stats?.totalFriendRewardsPaid || 0), {
                fallback: "€ 0.00",
              }),
              icon: <FiDollarSign className="h-4 w-4" />,
            },
          ].map((item) => (
            <Card key={item.title} className="rounded-2xl border-slate-200/70 shadow-sm [&_.ant-card-body]:p-4">
              <div className="mb-2 inline-flex items-center gap-2 text-slate-500">
                {item.icon}
                <span className="text-sm">{item.title}</span>
              </div>
              <p className="text-4xl font-semibold leading-none text-slate-700">{item.value}</p>
            </Card>
          ))
        )}
      </div>

      {/* Reward Prefill */}
      <Card className="rounded-2xl border-slate-200/70 shadow-sm [&_.ant-card-body]:p-4 sm:[&_.ant-card-body]:p-5">
        <div className="mb-3 inline-flex items-center gap-2 text-lg font-semibold text-slate-700">
          <FiSettings className="h-4 w-4" />
          {t("referrals.reward_configuration")}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm text-slate-500">{t("referrals.referrer_reward_label")}</p>
            <p className="text-2xl font-semibold text-slate-700">{formatMoney(rewardDefaults.referrerAmount)}</p>
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-500">{t("referrals.friend_reward_label")}</p>
            <p className="text-2xl font-semibold text-slate-700">{formatMoney(rewardDefaults.friendAmount)}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">{t("referrals.reward_config_hint")}</p>
      </Card>

      {/* Referrals Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="text-xl font-semibold text-slate-700">{t("referrals.all_referrals")}</h3>
          <p className="mt-0.5 text-sm text-slate-400">{t("referrals.tracking_description")}</p>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-[280px] flex-1">
            <Input
              allowClear
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t("referrals.search_placeholder")}
              prefix={<FiSearch className="mr-2 text-slate-400" />}
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <Select
            allowClear
            placeholder={t("referrals.status_filter")}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            style={{ height: "44px", minWidth: "160px" }}
            className="[&_.ant-select-selector]:!h-11 [&_.ant-select-selector]:!rounded-xl"
            options={[
              { value: "pending", label: t("referrals.pending") },
              { value: "registered", label: t("referrals.registered") },
              { value: "qualified", label: t("referrals.qualified") },
              { value: "rewarded", label: t("referrals.rewarded") },
              { value: "expired", label: t("referrals.expired") },
            ]}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spin size="large" />
          </div>
        ) : referrals.length === 0 ? (
          <div className="py-16">
            <Empty description={t("referrals.no_referrals")} />
          </div>
        ) : (
          <Table<IReferral>
            rowKey="id"
            columns={columns}
            dataSource={referrals}
            pagination={{
              current: meta?.page || page,
              pageSize: meta?.limit || 20,
              total: meta?.total || 0,
              onChange: (p) => setPage(p),
              className: "p-4",
              showSizeChanger: false,
            }}
            scroll={{ x: 800 }}
            className="[&_.ant-table-thead_th]:bg-slate-50 [&_.ant-table-thead_th]:text-[11px] [&_.ant-table-thead_th]:font-bold [&_.ant-table-thead_th]:text-slate-500 [&_.ant-table-thead_th]:tracking-wider [&_.ant-table-cell]:py-3"
          />
        )}
      </div>

      {/* Reward Amount Modal */}
      <Modal
        title={t("referrals.set_reward_amount")}
        open={rewardModalOpen}
        okText={t("referrals.confirm_payment_btn")}
        onOk={async () => {
          if (!selectedReferral) return;
          try {
            await updateStatus({
              id: selectedReferral.id,
              status: "rewarded",
              rewardAmount: rewardAmount,
              ...(selectedReferral.referredUserId && { friendRewardAmount }),
            }).unwrap();
            message.success(t("referrals.marked_as_paid"));
            setRewardModalOpen(false);
            setSelectedReferral(null);
          } catch {
            message.error(t("referrals.failed_to_update"));
          }
        }}
        onCancel={() => {
          setRewardModalOpen(false);
          setSelectedReferral(null);
        }}
        centered
      >
        <div className="space-y-4 py-4">
          <div>
            <p className="mb-2 text-sm text-slate-500">{t("referrals.referrer_reward_label")}</p>
            <InputNumber
              min={0}
              max={1000}
              precision={2}
              value={rewardAmount}
              onChange={(v) => v != null && setRewardAmount(v)}
              className="w-full rounded-lg"
              size="large"
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-slate-500">{t("referrals.friend_reward_label")}</p>
            {selectedReferral?.referredUserId ? (
              <InputNumber
                min={0}
                max={1000}
                precision={2}
                value={friendRewardAmount}
                onChange={(v) => v != null && setFriendRewardAmount(v)}
                className="w-full rounded-lg"
                size="large"
              />
            ) : (
              <p className="text-sm text-slate-400">{t("referrals.friend_reward_none")}</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Referrals;
