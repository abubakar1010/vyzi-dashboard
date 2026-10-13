import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { CardEmptyState, DashboardCard } from "./DashboardCard";
import { LuBellRing, LuCopy, LuCalendar, LuShieldCheck, LuSparkles, LuTriangleAlert, LuFileWarning, LuBrainCircuit } from "react-icons/lu";
import type { AdminDashboardData } from "../../redux/features/Dashboard/dashboardApi";
import { getEntityRoute } from "../../lib/helpers/entityRoute";
import { cn } from "../../utils/cn";

type Alert = AdminDashboardData["activeAlerts"][number];
type Props = { data?: AdminDashboardData["activeAlerts"]; className?: string };

const alertConfig: Record<string, {
  icon: React.ReactNode;
  actionKey: string;
  /** Icon tile colours. */
  tone: string;
}> = {
  duplicate_pod: {
    icon: <LuCopy className="h-5 w-5" />,
    actionKey: "dashboard.review",
    tone: "bg-red-50 text-red-600",
  },
  contract_expiring: {
    icon: <LuCalendar className="h-5 w-5" />,
    actionKey: "dashboard.view_list",
    tone: "bg-orange-50 text-orange-600",
  },
  ocr_verification: {
    icon: <LuShieldCheck className="h-5 w-5" />,
    actionKey: "dashboard.verify",
    tone: "bg-amber-50 text-amber-700",
  },
  high_value_lead: {
    icon: <LuSparkles className="h-5 w-5" />,
    actionKey: "dashboard.contact",
    tone: "bg-sky-50 text-sky-600",
  },
  sla_breach: {
    icon: <LuTriangleAlert className="h-5 w-5" />,
    actionKey: "dashboard.review",
    tone: "bg-red-50 text-red-600",
  },
  missing_documents: {
    icon: <LuFileWarning className="h-5 w-5" />,
    actionKey: "dashboard.review",
    tone: "bg-orange-50 text-orange-600",
  },
  ai_service_failure: {
    icon: <LuBrainCircuit className="h-5 w-5" />,
    actionKey: "dashboard.review",
    tone: "bg-red-50 text-red-600",
  },
};

const AI_FAILURE_REASONS = ["no_credit", "invalid_key", "model_unavailable", "rate_limited", "unavailable"];

/**
 * The backend writes alert text in English, as it does for every API message.
 * The AI failure alert carries its reason in `relatedData`, so it is written
 * here in the admin's language instead.
 */
function alertText(a: Alert, t: (key: string, options?: Record<string, unknown>) => string) {
  if (a.alertType !== "ai_service_failure") {
    return { title: a.title, description: a.description };
  }
  const data = a.relatedData ?? {};
  const reason = AI_FAILURE_REASONS.includes(String(data.reason)) ? String(data.reason) : "unavailable";
  const count = Number(data.failures) || 1;
  return {
    title: t("dashboard.ai_failure_title"),
    description: `${t(`dashboard.ai_failure_${reason}`)} ${t("dashboard.ai_failure_count", { count })}`,
  };
}

const defaultConfig = {
  icon: <LuTriangleAlert className="h-5 w-5" />,
  actionKey: "common.view",
  tone: "bg-slate-100 text-slate-600",
};

export function ActiveAlertsCard({ data, className }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const alerts = data ?? [];

  return (
    <DashboardCard
      className={className}
      title={t("dashboard.active_alerts")}
      icon={<LuBellRing className="h-[18px] w-[18px]" />}
      headerExtra={
        alerts.length > 0 ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 tabular-nums">
            {alerts.length}
          </span>
        ) : undefined
      }
    >
      {alerts.length === 0 ? (
        <CardEmptyState
          icon={<LuShieldCheck className="h-6 w-6" />}
          title={t("dashboard.no_active_alerts")}
          description={t("dashboard.no_active_alerts_desc")}
        />
      ) : (
        <ul className="space-y-2">
          {alerts.map((a: Alert) => {
            const cfg = alertConfig[a.alertType] ?? defaultConfig;
            const route = getEntityRoute(a.entityType, a.entityId);
            const text = alertText(a, t);
            return (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-xl border border-slate-200/70 p-3"
              >
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cfg.tone)}>
                  {cfg.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brand">{text.title}</p>
                  <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-slate-500">
                    {text.description ?? t("audit.no_description")}
                  </p>
                </div>
                {route ? (
                  <button
                    type="button"
                    onClick={() => navigate(route)}
                    className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {t(cfg.actionKey)}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
