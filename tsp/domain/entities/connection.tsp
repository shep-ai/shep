/**
 * @module Shep.Domain.Entities.Connection
 *
 * Connections (spec 122, generalised in spec 125): an account in an outside
 * tool shep reads and writes — an issue tracker, a knowledge base — owned by a
 * space, so work and personal accounts stay apart. Its secret (API key or
 * token) is stored encrypted by the repository and is not part of the entity.
 */
import "../../common/base.tsp";

/** An outside tool shep can connect to. */
@doc("An outside tool shep can connect to")
enum ConnectionProvider {
  @doc("Linear (GraphQL API, personal API key)")
  Linear,

  @doc("Jira Cloud (REST API v3, account email and API token)")
  Jira,

  @doc("Notion (REST API, internal integration token)")
  Notion,
}

/** What shep does with a provider's data. */
@doc("What shep does with a connection provider's data")
enum ConnectionKind {
  @doc("Issues kept in sync with shep projects (spec 122)")
  Tracker,

  @doc("Documents agents read as team knowledge (spec 125)")
  Knowledge,
}

/** Whether a connection's credentials last worked. */
@doc("Whether a connection's credentials last worked")
enum ConnectionStatus {
  @doc("The last check or sync reached the tool")
  Connected,

  @doc("The last check or sync failed; see lastError")
  Error,
}

/** An account in an outside tool shep can read and write. */
@doc("An account in an outside tool shep can read and write; the secret is stored encrypted outside the entity")
model Connection extends BaseEntity {
  @doc("Which tool")
  provider: ConnectionProvider;

  @doc("Display name")
  name: string;

  @doc("CLI-friendly identifier, unique across connections")
  slug: string;

  @doc("The space the connection belongs to")
  spaceId: string;

  @doc("Jira site URL such as https://acme.atlassian.net; unset for other tools")
  siteUrl?: string;

  @doc("Jira account email used with the API token; unset for other tools")
  accountEmail?: string;

  @doc("The account name reported by the last successful check")
  accountName?: string;

  @doc("Whether the credentials last worked")
  status: ConnectionStatus;

  @doc("Why the last check or sync failed")
  lastError?: string;

  @doc("When the credentials were last checked")
  lastCheckedAt?: utcDateTime;
}
