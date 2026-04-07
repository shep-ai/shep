/**
 * @module Shep.Common.Enums.Language
 *
 * Defines the Language enum for supported UI languages.
 * Controls which language Shep uses for all user-facing strings
 * across CLI, TUI, and Web UI presentation layers.
 */
/**
 * Supported UI languages for internationalization.
 *
 * Each value corresponds to an ISO 639-1 language code used for
 * locale resolution, translation file loading, and HTML lang attribute.
 * Arabic and Hebrew are right-to-left (RTL) languages requiring
 * special layout handling in the Web UI.
 */
@doc("Supported UI language for i18n")
enum Language {
  @doc("English")
  English: "en",

  @doc("Ukrainian")
  Ukrainian: "uk",

  @doc("Russian")
  Russian: "ru",

  @doc("Portuguese")
  Portuguese: "pt",

  @doc("Spanish")
  Spanish: "es",

  @doc("Arabic (RTL)")
  Arabic: "ar",

  @doc("Hebrew (RTL)")
  Hebrew: "he",

  @doc("French")
  French: "fr",

  @doc("German")
  German: "de",
}
