import { App, Steps, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiPhone } from "react-icons/fi";
import { LuFlame, LuZap } from "react-icons/lu";
import { useNavigate } from "react-router";
import { CaseDetailsTab } from "./BillRequestDetailView";
import {
  ACTIVATION_CASE_STEPS,
  ACTIVATION_REQUEST_STATUS_COLOR,
  ACTIVATION_STATUS_GROUPS,
  activationCaseStep,
  type ActivationRequestStatus,
} from "../../constants/activationRequest";
import { useUpdateCaseMutation, type ICase } from "../../redux/features/Cases/caseApi";
import { getApiErrorMessage } from "../../utils/apiError";
import { getLocale } from "../../utils/format";

/**
 * The full case for an activation request: the same panels a bill-based case
 * shows, without the bill. Its status lives on the case, and can be set to any
 * value in either direction.
 */
const ActivationCaseView = ({ caseData }: { caseData: ICase }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [updateCase, { isLoading: isUpdating }] = useUpdateCaseMutation();

  const status = caseData.status as ActivationRequestStatus;
  const step = activationCaseStep(status);
  const isGas = caseData.energyType === "gas";
  const holder = [
    caseData.contactFirstName || caseData.user?.firstName,
    caseData.contactLastName || caseData.user?.lastName,
  ]
    .filter(Boolean)
    .join(" ");
  const phone = caseData.contactPhone || caseData.user?.phone;

  const changeStatus = async (next: string) => {
    try {
      await updateCase({ id: caseData.id, data: { status: next } }).unwrap();
      message.success(
        t("activation_requests.status_changed", {
          status: t(`activation_requests.status.${next}`),
        }),
      );
    } catch (error) {
      message.error(getApiErrorMessage(error, t("activation_requests.save_failed")));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => navigate("/case-management?tab=activations")}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <FiArrowLeft className="h-4 w-4" />
          {t("activation_requests.back_to_cases")}
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">
            {t(`activation_requests.types.${caseData.caseType}`)}
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
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-medium text-slate-700">{holder || "—"}</span>
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-1 text-[#7061ED]">
              <FiPhone className="h-3.5 w-3.5" />
              {t("activation_requests.call")}
            </a>
          )}
          <span>
            {t("activation_requests.header_meta", {
              number: caseData.caseNumber ?? "—",
              date: new Date(caseData.createdAt).toLocaleString(getLocale(), {
                dateStyle: "short",
                timeStyle: "short",
              }),
            })}
          </span>
        </p>
      </div>

      {step >= 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
          <Steps
            size="small"
            current={step}
            items={ACTIVATION_CASE_STEPS.map((item) => ({
              title: t(`activation_requests.status.${item}`),
            }))}
          />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
        <CaseDetailsTab
          caseId={caseData.id}
          bill={null}
          onStatusSelect={changeStatus}
          statusUpdating={isUpdating}
          statusGroups={ACTIVATION_STATUS_GROUPS}
        />
      </div>
    </div>
  );
};

export default ActivationCaseView;
