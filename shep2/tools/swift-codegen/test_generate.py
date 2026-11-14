"""Tests for the Swift generator. Run: python3 -m unittest discover shep2/tools/swift-codegen"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generate  # noqa: E402


def doc(schemas, methods=None, notifications=None):
    return {
        "openrpc": "1.3.2",
        "info": {"title": "t", "version": "1"},
        "methods": methods or [],
        "x-notifications": notifications or [],
        "components": {"schemas": schemas},
    }


def models(schemas):
    return generate.render(doc(schemas))["Models.swift"]


class NamesTest(unittest.TestCase):
    def test_snake_case_fields_become_lower_camel(self):
        self.assertEqual(generate.field_name("needs_you"), "needsYou")
        self.assertEqual(generate.field_name("while_you_slept"), "whileYouSlept")
        self.assertEqual(generate.field_name("id"), "id")

    def test_reserved_words_are_escaped(self):
        self.assertEqual(generate.field_name("default"), "`default`")

    def test_variants_become_lower_camel_cases(self):
        self.assertEqual(generate.case_name("NeedsYou"), "needsYou")
        self.assertEqual(generate.case_name("GitHubIssue"), "gitHubIssue")

    def test_method_names_become_functions(self):
        self.assertEqual(generate.method_name("settings.get"), "settingsGet")
        self.assertEqual(generate.method_name("day.first_run"), "dayFirstRun")

    def test_task_is_renamed_so_it_never_shadows_swift_concurrency(self):
        self.assertEqual(generate.type_name("Task"), "ShepTask")
        self.assertEqual(generate.type_name("Board"), "Board")


class ModelsTest(unittest.TestCase):
    def test_string_enum(self):
        out = models({"TaskState": {"type": "string", "enum": ["Queued", "NeedsYou"]}})
        self.assertIn("public enum TaskState: String, Codable, Hashable, Sendable, CaseIterable {", out)
        self.assertIn('case needsYou = "NeedsYou"', out)

    def test_one_of_plain_strings_merges_into_one_enum(self):
        out = models(
            {
                "StepView": {
                    "oneOf": [
                        {"type": "string", "enum": ["Queued", "Coding"]},
                        {"type": "string", "const": "Parked"},
                    ]
                }
            }
        )
        self.assertIn("public enum StepView: String, Codable, Hashable, Sendable, CaseIterable {", out)
        self.assertIn('case parked = "Parked"', out)

    def test_integer_alias(self):
        out = models({"TaskId": {"type": "integer", "format": "int64"}})
        self.assertIn("public typealias TaskId = Int64", out)

    def test_struct_puts_required_fields_first_in_their_declared_order(self):
        out = models(
            {
                "Board": {
                    "type": "object",
                    "properties": {
                        "a_late": {"type": "string"},
                        "needs_you": {"type": "array", "items": {"$ref": "#/components/schemas/Task"}},
                        "count": {"type": "integer", "format": "uint"},
                        "note": {"type": ["string", "null"]},
                    },
                    "required": ["needs_you", "count", "a_late"],
                }
            }
        )
        self.assertIn("public struct Board: Codable, Hashable, Sendable {", out)
        self.assertIn(
            "public init(needsYou: [ShepTask], count: Int, aLate: String, note: String? = nil)", out
        )
        self.assertIn('case needsYou = "needs_you"', out)
        self.assertIn("public var note: String?", out)

    def test_any_of_null_is_optional(self):
        out = models(
            {
                "S": {
                    "type": "object",
                    "properties": {
                        "agent": {"anyOf": [{"$ref": "#/components/schemas/AgentKind"}, {"type": "null"}]}
                    },
                    "required": [],
                }
            }
        )
        self.assertIn("public var agent: AgentKind?", out)

    def test_externally_tagged_enum(self):
        out = models(
            {
                "ReviewAction": {
                    "oneOf": [
                        {"type": "string", "enum": ["Merge"]},
                        {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["SendBack"],
                            "properties": {
                                "SendBack": {
                                    "type": "object",
                                    "properties": {"note": {"type": "string"}},
                                    "required": ["note"],
                                }
                            },
                        },
                        {
                            "type": "object",
                            "required": ["Started"],
                            "properties": {
                                "Started": {"type": "array", "items": {"$ref": "#/components/schemas/Task"}}
                            },
                        },
                    ]
                }
            }
        )
        self.assertIn("public enum ReviewAction: Codable, Hashable, Sendable {", out)
        self.assertIn("case merge", out)
        self.assertIn("case sendBack(note: String)", out)
        self.assertIn("case started([ShepTask])", out)
        self.assertIn('case "SendBack":', out)

    def test_string_maps_become_dictionaries(self):
        out = models(
            {
                "S": {
                    "type": "object",
                    "properties": {"options": {"type": "object", "additionalProperties": {"type": "string"}}},
                    "required": ["options"],
                }
            }
        )
        self.assertIn("public var options: [String: String]", out)

    def test_unknown_shapes_fail_loudly(self):
        with self.assertRaises(generate.SchemaError):
            models({"X": {"type": "object", "properties": {"y": {"type": "object"}}, "required": []}})


class MethodsTest(unittest.TestCase):
    def render_methods(self):
        methods = [
            {
                "name": "review",
                "params": [
                    {"name": "action", "required": True, "schema": {"$ref": "#/components/schemas/ReviewAction"}},
                    {"name": "id", "required": True, "schema": {"$ref": "#/components/schemas/TaskId"}},
                ],
                "result": {"name": "result", "schema": {"$ref": "#/components/schemas/Task"}},
                "summary": "Decide.",
            },
            {
                "name": "add",
                "params": [
                    {"name": "from_dir", "required": False, "schema": {"type": ["string", "null"]}},
                    {"name": "input", "required": True, "schema": {"type": "string"}},
                ],
                "result": {"name": "result", "schema": {"$ref": "#/components/schemas/Task"}},
            },
            {"name": "brief.morning", "params": [], "result": {"name": "result", "schema": {
                "anyOf": [{"$ref": "#/components/schemas/Brief"}, {"type": "null"}]}}},
            {"name": "agent.send", "params": [], "result": {"name": "result", "schema": {"type": "null"}}},
        ]
        notes = [
            {"name": "board.changed", "params": [
                {"name": "board", "required": True, "schema": {"$ref": "#/components/schemas/Board"}}]}
        ]
        return generate.render(doc({}, methods, notes))["Methods.swift"]

    def test_method_names_are_an_enum(self):
        out = self.render_methods()
        self.assertIn('case briefMorning = "brief.morning"', out)

    def test_id_comes_first_then_other_required_then_optional(self):
        out = self.render_methods()
        self.assertIn("func review(id: TaskId, action: ReviewAction) async throws -> ShepTask", out)
        self.assertIn("func add(input: String, fromDir: String?) async throws -> ShepTask", out)

    def test_optional_params_get_a_shorter_overload(self):
        out = self.render_methods()
        self.assertIn("func add(input: String) async throws -> ShepTask", out)

    def test_results(self):
        out = self.render_methods()
        self.assertIn("func briefMorning() async throws -> Brief?", out)
        self.assertIn("func agentSend() async throws\n", out)

    def test_params_structs_and_rpc_implementation(self):
        out = self.render_methods()
        self.assertIn("public struct AddParams: Codable, Hashable, Sendable {", out)
        self.assertIn("try await call(.add, AddParams(input: input, fromDir: fromDir), as: ShepTask.self)", out)
        self.assertIn("try await call(.briefMorning, NoParams(), as: Brief?.self)", out)

    def test_notifications(self):
        out = self.render_methods()
        self.assertIn('case boardChanged = "board.changed"', out)
        self.assertIn("case boardChanged(Board)", out)


class CheckModeTest(unittest.TestCase):
    def test_check_reports_drift_and_write_fixes_it(self):
        schema = doc({"TaskState": {"type": "string", "enum": ["Queued"]}})
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "openrpc.json")
            with open(path, "w") as f:
                json.dump(schema, f)
            out = os.path.join(tmp, "Generated")
            self.assertEqual(generate.main([path, out, "--check"]), 1)
            self.assertEqual(generate.main([path, out]), 0)
            self.assertEqual(generate.main([path, out, "--check"]), 0)
            with open(os.path.join(out, "Models.swift"), "a") as f:
                f.write("// edited by hand\n")
            self.assertEqual(generate.main([path, out, "--check"]), 1)


if __name__ == "__main__":
    unittest.main()
