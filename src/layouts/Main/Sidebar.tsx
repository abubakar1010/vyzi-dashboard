import { NavLink, useLocation, useNavigate } from "react-router";
import { createElement, useState } from "react";
import Swal from "sweetalert2";
import { FiLogOut, FiX } from "react-icons/fi";
import { MdOutlineArrowRight } from "react-icons/md";
import { BrandLightningMark } from "../../components/ui/BrandLightningMark";
import { routeLinkGenerators } from "../../lib/helpers/generateLink";
import { useAppSelector, useAppDispatch } from "../../redux/hooks";
import { logout } from "../../redux/features/Auth/authSlice";
import { usePostLogoutMutation } from "../../redux/features/Auth/authApi";
import { useRemovePushTokenMutation } from "../../redux/features/Notifications/notificationApi";
import { clearStoredPushToken, getStoredPushToken } from "../../lib/webPush";
import type { TUserRole } from "../../types/common.type";
import { cn } from "../../utils/cn";
import { dashboardItems } from "../../constants/router.constants";
import { useTranslation } from "react-i18next";
type SidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

// Maps sidebar item names to i18n keys
const sidebarI18nKeys: Record<string, string> = {
  "Dashboard": "sidebar.dashboard",
  "Client Management": "sidebar.client_management",
  "Case Management": "sidebar.case_management",
  "Activation Requests": "sidebar.activation_requests",
  "Utilities / Services": "sidebar.utilities_services",
  "Meter Reading": "sidebar.meter_reading",
  "OCR": "sidebar.ocr",
  "Suppliers": "sidebar.suppliers",
  "Offers / Market": "sidebar.offers_market",
  "Agreement Section": "sidebar.agreement_section",
  "Referrals": "sidebar.referrals",
  "Support": "sidebar.support",
  "Notification Templates": "sidebar.notification_templates",
  "Support Topics": "sidebar.support_topics",
  "FAQ Management": "sidebar.faq_management",
  "Static Pages": "sidebar.static_pages",
  "Settings": "sidebar.settings",
};

const Sidebar = ({ mobileOpen = false, onMobileClose }: SidebarProps) => {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, refreshToken } = useAppSelector((state) => state.auth);
  const [postLogout] = usePostLogoutMutation();
  const [removePushToken] = useRemovePushTokenMutation();
  const [openNome, setOpenNome] = useState<{ name: string | null }>({
    name: null,
  });

  const translateName = (name: string) => {
    const key = sidebarI18nKeys[name];
    return key ? t(key) : name;
  };
  const handleLogOut = () => {
    Swal.fire({
      text: t("sidebar.logout_confirmation"),
      showCancelButton: true,
      confirmButtonText: t("common.logout"),
      cancelButtonText: t("common.cancel"),
      showConfirmButton: true,
      confirmButtonColor: "#DC2626",
      reverseButtons: true,
    }).then(async (res) => {
      if (res.isConfirmed) {
        if (refreshToken) {
          try {
            await postLogout({ refreshToken }).unwrap();
          } catch {
            // Server-side revocation failed — still clear local state
          }
        }
        // Release this browser's push token, otherwise the next admin to sign
        // in on this machine inherits the previous one's desktop alerts.
        const pushToken = getStoredPushToken();
        if (pushToken) {
          try {
            await removePushToken(pushToken).unwrap();
          } catch {
            // Best-effort — the backend also drops tokens FCM rejects
          }
          clearStoredPushToken();
        }
        dispatch(logout());
        navigate("/auth/sign-in");
      }
    });
  };

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-[15] h-screen min-h-0 w-[min(280px,88vw)] md:w-[250px] 2xl:w-[280px]",
        "transition-transform duration-300 ease-[cubic-bezier(0.3,0,0,1)] will-change-transform",
        "max-md:-translate-x-full max-md:shadow-[8px_0_40px_-8px_rgba(15,23,42,0.18)]",
        mobileOpen && "max-md:translate-x-0"
      )}
    >
      <div className="flex h-full min-h-0 w-full flex-col bg-white border-r border-slate-200/70">
        <div className="flex md:hidden shrink-0 items-center justify-end px-3 pt-3 pb-1">
          <button
            type="button"
            aria-label={t("sidebar.close_navigation")}
            onClick={() => onMobileClose?.()}
            className="rounded-xl p-2 text-brand hover:bg-primary/10 transition-colors"
          >
            <FiX className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="shrink-0 flex h-16 items-center gap-3 px-5 border-b border-slate-200/70 max-md:h-auto max-md:pb-4">
          <BrandLightningMark size="sm" decorative />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-bold tracking-tight text-brand">VYZI</p>
            <p className="truncate text-xs font-medium text-slate-500">{t("sidebar.admin_portal")}</p>
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-0.5 px-3 py-4 scroll-py-2 [scrollbar-width:thin] [scrollbar-color:oklch(0.68_0_0)_transparent]">
            {routeLinkGenerators(dashboardItems, user?.role as TUserRole).map(
              ({ name, icon, path, children, rootPath }, indx) =>
                children?.length ? (
                  <li key={indx} className="overflow-hidden">
                    <button
                      onClick={() => {
                        setOpenNome((c) => ({
                          name: c?.name === name ? null : name,
                        }));
                      }}
                      className={cn(
                        "hover:text-brand hover:bg-slate-100 outline-none text-slate-600 w-full px-3 py-2.5 flex items-center justify-between gap-3 text-sm font-medium rounded-xl group transition-colors duration-200 ease-[cubic-bezier(0.3,0,0,1)]",
                        {
                          "text-primary bg-primary/5":
                            name !== openNome?.name &&
                            location.pathname.includes(rootPath as string) &&
                            openNome.name,
                          "text-primary":
                            name === openNome?.name ||
                            (location.pathname.includes(rootPath as string) &&
                              !openNome.name),
                        }
                      )}
                    >
                      <div className="flex items-center justify-start gap-2.5">
                        <div>{createElement(icon, { size: "20" })}</div>
                        <span>{translateName(name)}</span>
                      </div>
                      <MdOutlineArrowRight
                        className={cn(
                          "text-slate-500 group-hover:text-[#373643] cursor-pointer transition-transform duration-300 ease-[cubic-bezier(0.3,0,0,1)]",
                          {
                            "rotate-90 text-[#373643] group-hover:text-slate-500 cursor-auto":
                              name === openNome?.name ||
                              (location.pathname.includes(rootPath as string) &&
                                !openNome.name),
                          }
                        )}
                        size={20}
                      />
                    </button>
                    <div
                      className={cn("space-y-0.5 h-0 overflow-hidden", {
                        "h-fit pt-0.5":
                          name === openNome?.name ||
                          (location.pathname.includes(rootPath as string) &&
                            !openNome.name),
                      })}
                    >
                      {children?.map((child, inx) => (
                        <NavLink
                          key={inx}
                          to={child.path as string}
                          onClick={() => onMobileClose?.()}
                          className={({ isActive }) =>
                            cn(
                              "hover:text-primary hover:bg-primary/5 text-slate-600 w-full pl-9 pr-3 py-2 flex items-center justify-start gap-2.5 text-sm rounded-lg transition-colors duration-200 ease-[cubic-bezier(0.3,0,0,1)]",
                              {
                                "text-primary bg-primary/10 relative before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-primary":
                                  isActive,
                              }
                            )
                          }
                        >
                          <div>{createElement(child.icon, { size: "15" })}</div>
                          <span> {translateName(child.name)}</span>
                        </NavLink>
                      ))}
                    </div>
                  </li>
                ) : (
                  <li
                    onClick={() => {
                      setOpenNome((c) => ({
                        name: c?.name === name ? null : name,
                      }));
                    }}
                    key={indx}
                  >
                    <NavLink
                      to={path as string}
                      onClick={() => onMobileClose?.()}
                      className={({ isActive }) =>
                        cn(
                          "w-full px-3 py-2.5 flex items-center justify-start gap-3 text-sm font-medium rounded-xl transition-colors duration-200 ease-[cubic-bezier(0.3,0,0,1)] text-slate-600 hover:bg-slate-100 hover:text-brand",
                          {
                            "!bg-primary/10 !text-primary font-semibold relative before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-primary":
                              isActive,
                          }
                        )
                      }
                    >
                      <div>{createElement(icon, { size: "18" })}</div>
                      <span> {translateName(name)}</span>
                    </NavLink>
                  </li>
                )
            )}
        </ul>
        <div className="shrink-0 px-3 py-3 border-t border-slate-200/70">
          <button
            onClick={handleLogOut}
            type="button"
            className="group w-full px-3 py-2.5 flex items-center justify-start gap-3 text-sm outline-none rounded-xl cursor-pointer transition-colors duration-200 ease-[cubic-bezier(0.3,0,0,1)] hover:bg-red-50/90 active:bg-red-50"
          >
            <FiLogOut className="text-red-400 transition-transform duration-200 group-hover:-translate-x-0.5" size={18} />
            <span className="text-red-500 font-medium">{t("common.logout")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
