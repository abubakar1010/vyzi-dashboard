import { Spin } from "antd";
import { Navigate, useParams } from "react-router";
import { useGetCaseByIdQuery } from "../../redux/features/Cases/caseApi";
import { isActivationRequestType } from "../../constants/activationRequest";

/**
 * `/case-management/case/:caseId` → `/case-management/:billId`, or to
 * `/activation-requests/:caseId` for an activation request, which has no bill.
 *
 * The case detail view is keyed by bill, but notifications and activity logs
 * about documents or status changes only carry the caseId. Resolve it here
 * instead of teaching every caller the mapping.
 */
const CaseRedirect = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const { data, isLoading, isError } = useGetCaseByIdQuery(caseId!, { skip: !caseId });

  if (!caseId || isError) {
    return <Navigate to="/case-management" replace />;
  }

  // An activation request has no bill; it has a page of its own.
  if (data && isActivationRequestType(data.caseType)) {
    return <Navigate to={`/activation-requests/${data.id}`} replace />;
  }

  if (!isLoading && !data?.billId) {
    return <Navigate to="/case-management" replace />;
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spin size="large" />
      </div>
    );
  }

  return <Navigate to={`/case-management/${data.billId}`} replace />;
};

export default CaseRedirect;
