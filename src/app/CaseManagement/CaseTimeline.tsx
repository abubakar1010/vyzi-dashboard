import type React from "react";
import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiEdit2, FiX } from "react-icons/fi";
import { LuFileCheck2, LuFilePlus2, LuMessageSquare, LuScanLine, LuUpload } from "react-icons/lu";
import i18n from "../../i18n";
import type { ICaseEvent } from "../../redux/features/Cases/caseApi";
import { getLocale } from "../../utils/format";

/**
 * A case's history, newest first. Shared by the bill-based case detail and the
 * activation request detail, which both read the same `case_events`.
 */

const eventIconMap: Record<string, { icon: React.ReactNode; color: string }> = {
  STATUS_CHANGE: { icon: <FiCheckCircle className="h-5 w-5 text-white" />, color: "bg-orange-500" },
  DOCUMENT_UPLOADED: { icon: <LuUpload className="h-5 w-5 text-white" />, color: "bg-blue-500" },
  DOCUMENT_VERIFIED: { icon: <LuFileCheck2 className="h-5 w-5 text-white" />, color: "bg-emerald-500" },
  DOCUMENT_REJECTED: { icon: <FiX className="h-5 w-5 text-white" />, color: "bg-red-500" },
  OCR_COMPLETED: { icon: <LuScanLine className="h-5 w-5 text-white" />, color: "bg-teal-500" },
  CONTRACT_GENERATED: { icon: <LuFileCheck2 className="h-5 w-5 text-white" />, color: "bg-amber-500" },
  CONTRACT_SIGNED: { icon: <LuFileCheck2 className="h-5 w-5 text-white" />, color: "bg-green-500" },
  ADMIN_ASSIGNED: { icon: <FiEdit2 className="h-5 w-5 text-white" />, color: "bg-purple-500" },
  NOTE_ADDED: { icon: <LuMessageSquare className="h-5 w-5 text-white" />, color: "bg-slate-500" },
  SYSTEM_EVENT: { icon: <LuFilePlus2 className="h-5 w-5 text-white" />, color: "bg-purple-500" },
};

const fmtDate = (val: string) =>
  new Date(val).toLocaleDateString(getLocale(), {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

export default function CaseTimeline({ events }: { events: ICaseEvent[] }) {
  useTranslation();
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{i18n.t("audit.no_activity_yet")}</p>;
  }

  return (
    <div className="space-y-5">
      {events.map((event, idx) => {
        const ei = eventIconMap[event.eventType] || eventIconMap.SYSTEM_EVENT;
        const isFirst = idx === 0;
        return (
          <div key={event.id} className="flex gap-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ei.color}`}>
              {ei.icon}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800">{event.title}</h4>
                {isFirst && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                    {i18n.t("audit.current_step")}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="mt-0.5 text-sm text-slate-600">{event.description}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                <span className="text-[#7061ED] font-medium">{event.actorLabel || i18n.t("audit.system_actor")}</span>
                {" • "}
                {fmtDate(event.createdAt)}{" "}
                {new Date(event.createdAt).toLocaleTimeString(getLocale(), {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
