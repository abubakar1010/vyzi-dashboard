import { Spin } from "antd";
import { Navigate, useParams } from "react-router";
import { useGetCaseByIdQuery } from "../../redux/features/Cases/caseApi";
import { isActivationRequestType } from "../../constants/activationRequest";
import ActivationCaseView from "./ActivationCaseView";

/**
 * `/case-management/case/:caseId` → `/case-management/:billId`, or the full case
 * right here for an activation request, which has no bill to be keyed by.
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

  if (data && isActivationRequestType(data.caseType)) {
    return <ActivationCaseView caseData={data} />;
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
