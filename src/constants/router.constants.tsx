
import Home from "../app/Home";
import Notification from "../app/Notification";
import ActivityHistory from "../app/ActivityHistory";
import PriorityTasks from "../app/PriorityTasks";
import type { DashboardItem } from "../types/sidebar.type";
import { ROLE } from "../types/common.type";
import {
  LuLayoutDashboard,
  LuSettings,
  LuUsers,
  LuZap,
  LuFileText,
  LuScanLine,
  LuTag,
  LuClipboardCheck,
  LuGift,
  LuMessageCircle,
  LuBuilding2,
  LuCircleHelp,
  LuBookOpen,
  LuLayoutTemplate,
  LuPhoneCall,
} from "react-icons/lu";
import Settings from "../app/Settings/Settings";
import ClientManagement from "../app/ClientManagement";
import CaseManagement from "../app/CaseManagement";
import BillRequestDetailView from "../app/CaseManagement/BillRequestDetailView";
import CaseRedirect from "../app/CaseManagement/CaseRedirect";
import ActivationRequests from "../app/ActivationRequests";
import ActivationRequestDetail from "../app/ActivationRequests/ActivationRequestDetail";
import MeterReading from "../app/MetterReading";
import MeterDetails from "../app/MetterReading/MeterDetails";
import OCRBills from "../app/OCR";
import Suppliers from "../app/Suppliers";
import SupplierDetails from "../app/Suppliers/SupplierDetails";
import OffersMarket from "../app/OffersMarket";
import OfferDetailsPage from "../app/OffersMarket/OfferDetailsPage";
import Agreements from "../app/Agreements";
import AgreementDetailsView from "../app/Agreements/AgreementDetailsView";
import Referrals from "../app/Referrals";
import SupportTicket from "../app/SupportTicket";
import TicketDetailsView from "../app/SupportTicket/TicketDetailsView";
import SupportTopics from "../app/SupportTopics";
import FAQManagement from "../app/FAQManagement";
import StaticPages from "../app/StaticPages";
import NotificationTemplates from "../app/NotificationTemplates";

export const dashboardItems: DashboardItem[] = [
  {
    name: "Dashboard",
    path: "/",
    icon: LuLayoutDashboard,
    element: <Home />,
    role: [ROLE.ADMIN],
  },
  {
    path: "notifications",
    element: <Notification />,
  },
  {
    path: "activity-history",
    element: <ActivityHistory />,
  },
  {
    // Opened from the Priority Tasks card, never from the sidebar — it is a
    // drill-down into the dashboard rather than a section of its own, so it
    // deliberately carries no `name`.
    path: "priority-tasks",
    element: <PriorityTasks />,
  },
  // {
  //   name: "Verify Request",
  //   path: "verification",
  //   icon: PiUserSwitchFill,
  //   role: [ROLE.ADMIN],
  //   children: [
  //     {
  //       name: "Doctor",
  //       path: "verification/doctor",
  //       icon: RiUserShared2Line,
  //       element: <RequestedLilst />,
  //       role: [ROLE.ADMIN],
  //     },
  //     {
  //       name: "Nurse",
  //       path: "verification/nurse",
  //       icon: RiUserShared2Line,
  //       element: <RequestedLilst />,
  //       role: [ROLE.ADMIN],
  //     },
  //     {
  //       name: "Patient",
  //       path: "verification/patient",
  //       icon: RiUserShared2Line,
  //       element: <RequestedLilst />,
  //       role: [ROLE.ADMIN],
  //     },
  //     {
  //       name: "Pharmacy",
  //       path: "verification/pharmacy",
  //       icon: RiUserShared2Line,
  //       element: <RequestedLilst />,
  //       role: [ROLE.ADMIN],
  //     },
  //   ],
  // },
  {
    name: "Client Management",
    path: "client-list",
    icon: LuUsers,
    role: [ROLE.ADMIN],
    element: <ClientManagement />,
  },
  {
    name: "Case Management",
    path: "case-management",
    icon: LuFileText,
    role: [ROLE.ADMIN],
    element: <CaseManagement />,
  },
  {
    // Notifications and activity logs about a case only carry its caseId; this
    // resolves the case to its bill and forwards to the detail view below.
    path: "case-management/case/:caseId",
    element: <CaseRedirect />,
  },
  {
    path: "case-management/:billId",
    element: <BillRequestDetailView />,
  },
  {
    // "Attiva una nuova utenza" requests: cases with no bill, so they are not
    // in Case Management, which lists bills.
    name: "Activation Requests",
    path: "activation-requests",
    icon: LuPhoneCall,
    role: [ROLE.ADMIN],
    element: <ActivationRequests />,
  },
  {
    path: "activation-requests/:caseId",
    element: <ActivationRequestDetail />,
  },
  {
    name: "Utilities / Services",
    path: "meter-reading",
    icon: LuZap,
    role: [ROLE.ADMIN],
    element: <MeterReading />,
  },
  {
    path: "meter-reading/:meterId",
    element: <MeterDetails />,
  },
  {
    name: "OCR",
    path: "ocr",
    icon: LuScanLine,
    role: [ROLE.ADMIN],
    element: <OCRBills />,
  },
  {
    name: "Suppliers",
    path: "suppliers",
    icon: LuBuilding2,
    role: [ROLE.ADMIN],
    element: <Suppliers />,
  },
  {
    path: "suppliers/:supplierId",
    element: <SupplierDetails />,
  },
  {
    name: "Offers / Market",
    path: "offers-market",
    icon: LuTag,
    role: [ROLE.ADMIN],
    element: <OffersMarket />,
  },
  {
    path: "offers-market/:offerId",
    element: <OfferDetailsPage />,
  },
  {
    name: "Agreement Section",
    path: "agreements",
    icon: LuClipboardCheck,
    role: [ROLE.ADMIN],
    element: <Agreements />,
  },
  {
    path: "agreements/:agreementId",
    element: <AgreementDetailsView />,
  },
  {
    name: "Referrals",
    path: "referrals",
    icon: LuGift,
    role: [ROLE.ADMIN],
    element: <Referrals />,
  },
  {
    name: "Support",
    path: "support-ticket",
    icon: LuMessageCircle,
    role: [ROLE.ADMIN],
    element: <SupportTicket />,
  },
  {
    path: "support-ticket/:ticketId",
    element: <TicketDetailsView />,
  },
  {
    name: "Support Topics",
    path: "support-topics",
    icon: LuTag,
    role: [ROLE.ADMIN],
    element: <SupportTopics />,
  },
  {
    name: "FAQ Management",
    path: "faq-management",
    icon: LuCircleHelp,
    role: [ROLE.ADMIN],
    element: <FAQManagement />,
  },
  {
    name: "Static Pages",
    path: "static-pages",
    icon: LuBookOpen,
    role: [ROLE.ADMIN],
    element: <StaticPages />,
  },
  {
    name: "Notification Templates",
    path: "notification-templates",
    icon: LuLayoutTemplate,
    role: [ROLE.ADMIN],
    element: <NotificationTemplates />,
  },
  // {
  //   name: "Requests",
  //   path: "requests",
  //   icon: IoFingerPrint,
  //   role: [ROLE.COMPANY, ROLE.BRANCH, ROLE.INSPECTOR],
  //   children: [
  //     {
  //       name: "Leave",
  //       path: "requests/leaves",
  //       icon: FcLeave,
  //       element: <LeaveRequest />,
  //       role: [ROLE.COMPANY, ROLE.BRANCH, ROLE.INSPECTOR],
  //     },
  //     {
  //       name: "Attendance",
  //       path: "requests/attendances",
  //       icon: MdOutlineManageHistory,
  //       element: <AttendanceRequest />,
  //       role: [ROLE.COMPANY, ROLE.BRANCH, ROLE.INSPECTOR],
  //     },
  //   ],
  // },
  // {
  //   name: "Subscriptions",
  //   path: "subscriptions",
  //   icon: FaRegChessQueen,
  //   role: [ROLE.ADMIN, ROLE.COMPANY],
  //   element: <Subscriptions />,
  // },
  // {
  //   path: "subscriptions/:id",
  //   element: <SubscriptionPurchase />,
  // },

  // settings
  {
    name: "Settings",
    path: "settings",
    icon: LuSettings,
    role: Object.values(ROLE),
    element: <Settings />,
  },
];
