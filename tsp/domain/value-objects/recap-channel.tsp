/**
 * @module Shep.Domain.ValueObjects.RecapChannel
 *
 * Channel a contributor recap can be published to. Used as the discriminator
 * on the `IRecapPublisher` port's target union so callers cannot pass a raw
 * string and so adding a future channel surfaces every match site at compile
 * time (NFR-3 — no raw string comparisons for domain concepts).
 */
/**
 * Recap Channel
 *
 * Three channels in v1: a durable file in `recaps/YYYY-MM.md`, a Discord
 * post for community reach, and a GitHub Discussion for SEO + archive.
 */
@doc("Channel a contributor recap can be published to")
enum RecapChannel {
  @doc("Write the recap markdown to recaps/YYYY-MM.md in the workspace")
  File: "file",

  @doc("Post the recap as a Discord channel message")
  Discord: "discord",

  @doc("Open a GitHub Discussion containing the recap")
  GithubDiscussion: "githubDiscussion",
}
