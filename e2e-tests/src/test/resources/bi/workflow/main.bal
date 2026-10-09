import ballerina/http;
import ballerina/workflow;
import wso2/icp.runtime.bridge as _;

configurable int httpPort = 9090;

type Order record {|
    string id;
|};

type Approval record {|
    boolean approved;
|};

// A human task is listed only to callers holding one of its roles; the seeded admin holds Super Admin.
@workflow:Workflow
function orderApproval(workflow:Context ctx, Order 'order) returns string|error {
    Approval approval = check ctx->awaitHumanTask("approveOrder", {orderId: 'order.id},
            userRoles = "Super Admin", title = "Approve order " + 'order.id);
    return approval.approved ? "APPROVED" : "REJECTED";
}

service / on new http:Listener(httpPort) {
    resource function get health() returns string => "ok";
}
