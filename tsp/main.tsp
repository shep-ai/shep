/**
 * Shep AI Domain Model Specification
 *
 * Main entry point for the TypeSpec domain model definitions
 * for the Shep AI CLI - an Autonomous AI Native SDLC Platform.
 *
 * Model Hierarchy:
 * +-- common/          Base types, scalars, enums
 * +-- domain/          Business entities and value objects
 * +-- agents/          AI agent system definitions
 * +-- deployment/      Deployment configuration models
 * +-- ui/              Presentation-layer value objects
 *
 * @module main
 * @version 0.1.0
 * @see README.md for full documentation
 */
import "./common/index.tsp";
import "./domain/index.tsp";
import "./agents/index.tsp";
import "./deployment/index.tsp";
import "./ui/index.tsp";

@service(#{ title: "Shep AI Domain Models" })
namespace ShepAI.Domain;
