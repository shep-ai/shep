/**
 * @module Shep.Agents.FeatureAgent
 *
 * Feature Agent - The MAIN ORCHESTRATING AGENT of the Shep AI system.
 *
 * The FeatureAgent is the central "brain" that manages the entire SDLC workflow
 * for a feature. It orchestrates sub-agents, gathers requirements, conducts
 * research, creates plans, and drives implementation to completion.
 *
 * ## Orchestration Workflow
 *
 * ```
 *                        +-------------------+
 *                        |   FeatureAgent    |
 *                        |    (The Brain)    |
 *                        +--------+----------+
 *                                 |
 *         +----------+------------+------------+----------+
 *         |          |            |            |          |
 *         v          v            v            v          v
 *   +---------+ +---------+ +---------+ +---------+ +---------+
 *   | Wizard  | | Require | | Research| |  Plan   | | Implement|
 *   |  Node   | |  Node   | |  Node   | |  Node   | |   Node   |
 *   +---------+ +---------+ +---------+ +---------+ +---------+
 *         |          |            |            |          |
 *         v          v            v            v          v
 *      Feature  Requirements  Research     Plan      Execution
 *      Created    Gathered    Complete   Approved    Complete
 * ```
 *
 * ## State Machine
 *
 * ```
 * +------------------------+     +---------------------------+
 * | GatheringRequirements  | --> | ClarificationsRequired    |
 * +------------------------+     +---------------------------+
 *            |                              |
 *            v                              v
 *            +<-----------------------------+
 *            |
 *            v
 * +------------------------+
 * |     DoingResearch      |
 * +------------------------+
 *            |
 *            v
 * +------------------------+
 * |    AwaitingReview      |
 * +------------------------+
 *            |
 *            v
 * +------------------------+
 * |   ExecutingWorkPlan    |
 * +------------------------+
 *            |
 *            v
 * +------------------------+
 * |        Ready           |
 * +------------------------+
 * ```
 *
 * ## Responsibilities
 *
 * 1. **New Feature Initialization**: Guide users through feature setup wizard
 * 2. **Requirements Gathering**: Collect and refine requirements interactively
 * 3. **Technical Research**: Analyze codebase and research approaches
 * 4. **Plan Creation**: Generate detailed implementation plans
 * 5. **Implementation Coordination**: Orchestrate sub-agents for execution
 * 6. **User Communication**: Answer questions about the feature
 *
 * @see docs/architecture/agent-system.md - Detailed agent architecture
 * @see ./base.tsp - AgentInstance base model
 * @see ./deploy-agent.tsp - Deployment agent for local deployments
 */
import "../common/scalars.tsp";
import "../common/enums/states.tsp";
import "../common/ask.tsp";
import "../domain/entities/feature.tsp";
import "../domain/entities/plan.tsp";
import "../domain/entities/requirement.tsp";
import "../domain/entities/research.tsp";
import "./base.tsp";

/**
 * The main orchestrating agent for feature development.
 *
 * FeatureAgent is the central coordinator that manages the entire SDLC workflow
 * for a feature. It is the PRIMARY "BRAIN" of the Shep AI system, responsible
 * for understanding user intent and driving features from idea to deployment.
 *
 * ## Key Characteristics
 *
 * - **Autonomous**: Operates independently once initialized
 * - **Interactive**: Engages users for clarification when needed
 * - **Orchestrating**: Spawns and coordinates sub-agents for specific tasks
 * - **Stateful**: Maintains state across the entire feature lifecycle
 *
 * ## Agent Composition
 *
 * The FeatureAgent spawns specialized AgentInstance children to handle:
 * - Code analysis and pattern detection
 * - Requirement extraction and clarification
 * - Research and technical discovery
 * - Plan generation and validation
 * - Code implementation and testing
 *
 * @example
 * ```typescript
 * const featureAgent: FeatureAgent = {
 *   id: "fa-001",
 *   feature: myFeature,
 *   agents: [analyzeAgent, implementAgent],
 *   state: FeatureAgentState.ExecutingWorkPlan,
 *   createdAt: new Date()
 * };
 * ```
 *
 * @see docs/architecture/agent-system.md - Agent system architecture
 */
@doc("Main orchestrating agent - the 'brain' that manages the complete SDLC workflow for a feature")
model FeatureAgent {
  @doc("Unique identifier for this feature agent instance")
  id: UUID;

  @doc("The feature being managed by this agent throughout its lifecycle")
  feature: Feature;

  @doc("Sub-agents spawned to handle specific tasks within the workflow")
  agents: AgentInstance[];

  @doc("Current operational state determining what the agent is doing")
  state: FeatureAgentState;

  @doc("Timestamp when this feature agent was created")
  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;
}

/**
 * Operations available on the FeatureAgent.
 *
 * These operations represent the primary workflow capabilities of the
 * feature agent, covering the complete SDLC from initialization through
 * implementation.
 *
 * ## Operation Sequence
 *
 * ```
 * 1. NewFeatureWizard()     --> Creates Feature, initializes agent
 * 2. GatherRequirements()   --> Collects user requirements interactively
 * 3. DoResearch()           --> Analyzes codebase, researches approaches
 * 4. CreatePlan()           --> Generates implementation plan
 * 5. BeginImplementation()  --> Starts executing the plan
 * 6. Ask(query)             --> Available at any time for user questions
 * ```
 *
 * ## Interactive Operations
 *
 * Most operations are interactive and may:
 * - Ask the user clarifying questions
 * - Present options for user selection
 * - Request confirmation before proceeding
 *
 * The Ask operation enables natural language queries at any point
 * in the workflow.
 *
 * @see FeatureAgent - The model these operations act upon
 */
@doc("Operations for the FeatureAgent to manage the complete feature development workflow")
interface FeatureAgentOperations {
  /**
   * Initialize a new feature through an interactive wizard.
   *
   * The wizard guides the user through:
   * 1. Feature naming and description
   * 2. Repository selection/confirmation
   * 3. Initial scope definition
   * 4. Branch strategy configuration
   *
   * @returns The newly created Feature entity
   */
  @doc("Launch interactive wizard to initialize a new feature with guided setup")
  NewFeatureWizard(): Feature;

  /**
   * Gather requirements interactively from the user.
   *
   * This operation:
   * 1. Analyzes initial feature description
   * 2. Identifies ambiguities and gaps
   * 3. Asks clarifying questions
   * 4. Extracts functional and non-functional requirements
   * 5. Validates understanding with the user
   *
   * @returns Array of gathered requirements (user-provided and inferred)
   */
  @doc("Interactively gather and refine requirements through conversational AI")
  GatherRequirements(): Requirement[];

  /**
   * Perform research on technical approaches and existing patterns.
   *
   * Research activities include:
   * - Codebase analysis for patterns and conventions
   * - Dependency mapping
   * - Similar implementation discovery
   * - Technical feasibility assessment
   * - Risk identification
   *
   * @returns Research results with findings and artifacts
   */
  @doc("Conduct technical research on the codebase and implementation approaches")
  DoResearch(): Research;

  /**
   * Create a detailed implementation plan.
   *
   * The plan includes:
   * - High-level overview
   * - Tasks with dependencies
   * - Action items for each task
   * - Artifacts to be generated
   * - Acceptance criteria
   * - Work schedule (Gantt)
   *
   * @returns The generated Plan ready for review and execution
   */
  @doc("Generate a detailed implementation plan with tasks, action items, and artifacts")
  CreatePlan(): Plan;

  /**
   * Begin executing the implementation plan.
   *
   * This operation:
   * 1. Transitions agent to ExecutingWorkPlan state
   * 2. Spawns implementation sub-agents
   * 3. Begins processing tasks in dependency order
   * 4. Creates feature branches as needed
   * 5. Implements code changes autonomously
   *
   * The operation runs asynchronously; use Ask to query progress.
   */
  @doc("Begin autonomous execution of the approved implementation plan")
  BeginImplementation(): void;

  /**
   * Ask the agent a question about the feature.
   *
   * Supports queries about:
   * - Feature status and progress
   * - Requirements and their rationale
   * - Plan details and task status
   * - Implementation decisions
   * - Blockers and issues
   *
   * @param query Natural language question to ask
   * @returns AI-generated response with relevant information
   */
  @doc("Ask a natural language question about the feature or its implementation")
  Ask(query: string): AskResponse;
}
