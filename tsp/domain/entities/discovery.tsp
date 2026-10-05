/**
 * @module Shep.Domain.Entities.Discovery
 *
 * Discovery (spec 128): an agent reads a space's loose evidence and proposes
 * opportunities backed by it. Each run is recorded.
 */
import "../../common/base.tsp";
import "../../common/enums/agent-config.tsp";

/** Where a discovery run stands. */
@doc("Where a discovery run stands")
enum DiscoveryRunStatus {
  @doc("The agent is reading the evidence")
  Running,

  @doc("Finished; its proposals were created")
  Succeeded,

  @doc("The agent call failed or timed out")
  Failed,
}

/** One discovery pass over a space. */
@doc("One discovery pass over a space's evidence")
model DiscoveryRun extends BaseEntity {
  @doc("The space whose evidence was read")
  spaceId: string;

  @doc("Where the run stands")
  status: DiscoveryRunStatus;

  @doc("The agent that read the evidence")
  agentType?: AgentType;

  @doc("Unlinked signals the agent was shown")
  signalsRead: int32;

  @doc("Opportunities created from the agent's proposals")
  proposed: int32;

  @doc("Proposals dropped because they cited no real signal or repeated an open title")
  dropped: int32;

  @doc("When the run ended")
  finishedAt?: utcDateTime;

  @doc("Why the run failed")
  error?: string;
}
