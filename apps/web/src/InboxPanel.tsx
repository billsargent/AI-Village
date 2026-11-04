import { useApprovals, useDecideApproval, type ApprovalRequest } from './village-api.js';

function describe(request: ApprovalRequest): string {
  return request.preview ?? request.toolId;
}

/**
 * Spec section 12's approvals inbox: every tool call a villager asked for
 * that needs the owner's say. Approving runs it now; declining just
 * records the decision.
 */
export function InboxPanel() {
  const { data, isPending } = useApprovals();
  const decide = useDecideApproval();

  if (isPending || !data) {
    return <p className="text-ink-soft">Loading...</p>;
  }

  return (
    <div className="flex w-[28rem] max-w-full flex-col gap-3">
      {data.pending.length === 0 ? (
        <p className="text-ink-soft">Nothing is waiting on you.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.pending.map((request) => (
            <li
              key={request.id}
              className="flex items-center justify-between gap-3 border-b-2 border-parchment-dark pb-2"
            >
              <div>
                <div className="text-lg">{describe(request)}</div>
                <div className="text-sm text-ink-soft">
                  Asked by {request.requestedBy} - {request.risk} risk
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="wood-button"
                  disabled={decide.isPending}
                  aria-label={`Approve: ${describe(request)}`}
                  onClick={() => {
                    decide.mutate({ id: request.id, decision: 'approved' });
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="wood-button"
                  disabled={decide.isPending}
                  aria-label={`Decline: ${describe(request)}`}
                  onClick={() => {
                    decide.mutate({ id: request.id, decision: 'declined' });
                  }}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {decide.isError && (
        <p className="text-sm text-red-800" role="alert">
          Couldn't do that: {decide.error.message}
        </p>
      )}
      {data.decided.length > 0 && (
        <section>
          <h3 className="text-lg">Recently decided</h3>
          <ul className="list-disc pl-5 text-sm text-ink-soft">
            {data.decided.map((request) => (
              <li key={request.id}>
                {describe(request)} - {request.status}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
