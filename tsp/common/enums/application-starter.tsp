/**
 * @module Shep.Common.Enums.ApplicationStarter
 *
 * How a brand-new Application gets its first code.
 *
 *  - `blank` starts from an empty project. The app's first feature
 *    (spec-driven by default) decides the stack in its research phase,
 *    so any language or framework can come out of it.
 *  - `vite-shadcn` scaffolds the opinionated Vite + React + TypeScript +
 *    Tailwind + shadcn template and builds straight from chat with a live
 *    preview, without a spec phase.
 *
 * Either way the result is an Application that later features attach to.
 */
@doc("How a new Application gets its first code: a blank project or the Vite + shadcn template")
enum ApplicationStarter {
  /**
   * Empty project; the first feature (spec-driven by default) chooses the stack.
   */
  @doc("Empty project whose first feature chooses the stack")
  Blank: "blank",

  /**
   * Vite + React + TypeScript + Tailwind + shadcn template with a live preview.
   */
  @doc("Vite + React + TypeScript + Tailwind + shadcn template, built from chat")
  ViteShadcn: "vite-shadcn",
}
