"""Swift for the schema's methods and notifications: names, params, the calls protocol and its
JSON-RPC implementation."""

from models import Field, render_struct
from names import SchemaError, doc_lines, method_name, params_type
from swift_types import NULL_TYPE, spelled

# By convention the task a call is about comes first: `review(id:action:)`.
LEADING_PARAM = "id"
NO_PARAMS = "NoParams"


class Method:
    def __init__(self, method):
        self.name = method["name"]
        self.func = method_name(self.name)
        self.summary = method.get("summary")
        descriptors = method.get("params", [])
        ordered = sorted(
            descriptors,
            key=lambda d: (d["name"] != LEADING_PARAM, not d.get("required", False)),
        )
        self.fields = [
            Field(d["name"], d["schema"], d.get("required", False), d["schema"].get("description"))
            for d in ordered
        ]
        self.params_type = params_type(self.name) if self.fields else NO_PARAMS
        result = method["result"]["schema"]
        self.void = result.get("type") == "null"
        self.result = NULL_TYPE if self.void else spelled(result)

    def signature(self, fields):
        args = ", ".join(f"{f.label}: {f.spelled}" for f in fields)
        returns = "" if self.void else f" -> {self.result}"
        return f"func {self.func}({args}) async throws{returns}"

    @property
    def required_fields(self):
        return [f for f in self.fields if not f.optional]


def render_names(methods):
    lines = ["/// Every method the daemon answers, by its wire name.",
             "public enum ShepMethod: String, CaseIterable, Sendable {"]
    for m in methods:
        lines += doc_lines(m.summary, "    ") + [f'    case {m.func} = "{m.name}"']
    return lines + ["}"]


def render_params(methods):
    lines = ["/// The params of a call that takes none: `{}`.",
             f"public struct {NO_PARAMS}: Codable, Hashable, Sendable {{",
             "    public init() {}", "}"]
    for m in methods:
        if m.fields:
            lines += [""] + render_struct(m.params_type, m.fields, f"The params of `{m.name}`.")
    return lines


def render_protocol(methods):
    lines = ["/// Every call the daemon answers, one function per method. `DaemonClient` answers them",
             "/// over the socket; tests answer them with a fake.",
             "public protocol ShepCalls: Sendable {"]
    for m in methods:
        lines += doc_lines(m.summary, "    ") + [f"    {m.signature(m.fields)}"]
    lines += ["}", "", "extension ShepCalls {"]
    for m in methods:
        if len(m.required_fields) == len(m.fields):
            continue
        call_args = ", ".join(f"{f.label}: {f.label if not f.optional else 'nil'}" for f in m.fields)
        lines += [f"    public {m.signature(m.required_fields)} {{",
                  f"        try await {m.func}({call_args})", "    }"]
    lines += ["}", "", "extension ShepCalls where Self: RPCCalling {"]
    for m in methods:
        built = ", ".join(f"{f.label}: {f.name}" for f in m.fields)
        params = f"{m.params_type}({built})"
        prefix = "_ = " if m.void else ""
        lines += [f"    public {m.signature(m.fields)} {{",
                  f"        {prefix}try await call(.{m.func}, {params}, as: {m.result}.self)", "    }"]
    return lines + ["}"]


def render_notifications(notifications):
    entries = []
    for n in notifications:
        params = n.get("params", [])
        if len(params) != 1:
            raise SchemaError(f"notification {n['name']} must carry exactly one payload")
        entries.append((n["name"], method_name(n["name"]), spelled(params[0]["schema"]), n.get("summary")))
    lines = ["/// Every notification the daemon pushes, by its wire name.",
             "public enum ShepNotificationName: String, CaseIterable, Sendable {"]
    for wire, case, _, summary in entries:
        lines += doc_lines(summary, "    ") + [f'    case {case} = "{wire}"']
    lines += ["}", "", "/// A notification with its payload (the `params` object itself).",
              "public enum ShepNotification: Hashable, Sendable {"]
    lines += [f"    case {case}({payload})" for _, case, payload, _ in entries]
    lines += ["", "    /// `nil` for a notification this version does not know.",
              "    public init?(_ note: RPCNotification) throws {",
              "        guard let name = ShepNotificationName(rawValue: note.method) else { return nil }",
              "        switch name {"]
    lines += [f"        case .{case}: self = .{case}(try note.params({payload}.self))"
              for _, case, payload, _ in entries]
    return lines + ["        }", "    }", "}"]


def render(document):
    methods = [Method(m) for m in document.get("methods", [])]
    sections = [render_names(methods), render_params(methods), render_protocol(methods),
                render_notifications(document.get("x-notifications", []))]
    lines = []
    for section in sections:
        lines += section + [""]
    return lines

