import "../../common/scalars.tsp";
import "../../common/enums/feature-coordination.tsp";

@doc("The last agent coordination decision about a feature and one overlapping peer (spec 141)")
model FeatureCoordination {
  @doc("What the agent chose")
  action: CoordinationAction;

  @doc("The agent's one-paragraph reason, shown to the user")
  rationale: string;

  @doc("The other feature whose committed changes overlap this one")
  peerFeatureId: UUID;

  @doc("Repository-relative paths both features changed")
  overlappingPaths: string[];

  @doc("When the decision was applied")
  decidedAt: utcDateTime;
}
