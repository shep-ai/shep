"""Swift declarations for the schema's components: structs, enums and aliases."""

from names import SchemaError, case_name, doc_lines, field_name, type_name
from swift_types import required_type, swift_type

CONFORMANCES = "Codable, Hashable, Sendable"
KEY = "AnyCodingKey"


class Field:
    """One stored property: its JSON name, Swift name, type and whether it may be absent."""

    def __init__(self, json_name, schema, required, description=None):
        self.json_name = json_name
        self.name = field_name(json_name)
        self.type, nullable = swift_type(schema)
        self.optional = nullable or not required
        self.description = description or schema.get("description")

    @property
    def label(self):
        """The name without backticks, as an argument label or a `self.` member."""
        return self.name.strip("`")

    @property
    def spelled(self):
        return f"{self.type}?" if self.optional else self.type


def object_fields(schema):
    """Required fields first, in declaration order (schemars keeps it in `required`)."""
    props = schema.get("properties", {})
    required = schema.get("required", [])
    order = list(required) + [name for name in props if name not in required]
    return [Field(name, props[name], name in required) for name in order]


def render_struct(name, fields, description=None):
    lines = doc_lines(description) + [f"public struct {name}: {CONFORMANCES} {{"]
    for f in fields:
        lines += doc_lines(f.description, "    ") + [f"    public var {f.name}: {f.spelled}"]
    args = ", ".join(f"{f.label}: {f.spelled}" + (" = nil" if f.optional else "") for f in fields)
    lines += ["", f"    public init({args}) {{"]
    lines += [f"        self.{f.label} = {f.name}" for f in fields]
    lines += ["    }"]
    if fields:
        lines += ["", "    enum CodingKeys: String, CodingKey {"]
        for f in fields:
            same = f.label == f.json_name
            lines.append(f"        case {f.name}" + ("" if same else f' = "{f.json_name}"'))
        lines += ["    }"]
    return lines + ["}"]


# Read for any value a newer daemon sends that this app does not know; never sent by Shep.
UNKNOWN_RAW = "__unknown__"
UNKNOWN_DOC = "    /// A value from a newer daemon that this app does not know yet."


def render_string_enum(name, values, description=None):
    lines = doc_lines(description)
    lines += [f"public enum {name}: String, {CONFORMANCES}, CaseIterable {{"]
    lines += [f'    case {case_name(v)} = "{v}"' for v in values]
    known = ", ".join(f".{case_name(v)}" for v in values)
    lines += [
        UNKNOWN_DOC,
        f'    case unknown = "{UNKNOWN_RAW}"',
        "",
        f"    public static var allCases: [{name}] {{ [{known}] }}",
        "",
        "    public init(from decoder: Decoder) throws {",
        "        let raw = try decoder.singleValueContainer().decode(String.self)",
        "        self = Self(rawValue: raw) ?? .unknown",
        "    }",
    ]
    return lines + ["}"]


def unit_values(variant):
    """The names of a unit variant group, or None if the variant carries data."""
    if variant.get("type") != "string":
        return None
    if "enum" in variant:
        return list(variant["enum"])
    if "const" in variant:
        return [variant["const"]]
    raise SchemaError(f"string variant without values: {variant}")


class Variant:
    def __init__(self, tag, payload):
        self.tag = tag
        self.case = case_name(tag)
        self.fields = None
        self.value_type = None
        if payload.get("type") == "object" and "properties" in payload:
            self.fields = object_fields(payload)
        else:
            self.value_type = required_type(payload)

    def declaration(self):
        if self.fields is not None:
            return f"case {self.case}({', '.join(f'{f.label}: {f.spelled}' for f in self.fields)})"
        return f"case {self.case}({self.value_type})"


def data_variant(variant):
    props = variant.get("properties", {})
    if variant.get("type") != "object" or len(props) != 1:
        raise SchemaError(f"not an externally tagged variant: {variant}")
    (tag, payload), = props.items()
    return Variant(tag, payload)


def render_tagged_enum(name, units, variants, description=None):
    lines = doc_lines(description) + [f"public enum {name}: {CONFORMANCES} {{"]
    lines += [f"    case {case_name(u)}" for u in units]
    lines += [f"    {v.declaration()}" for v in variants]
    lines += [UNKNOWN_DOC, "    case unknown(String)"]
    lines += ["", "    public init(from decoder: Decoder) throws {"]
    if units:
        lines += ["        if let tag = try? decoder.singleValueContainer().decode(String.self) {",
                  "            switch tag {"]
        lines += [f'            case "{u}": self = .{case_name(u)}' for u in units]
        lines += ["            default:",
                  "                self = .unknown(tag)",
                  "            }", "            return", "        }"]
    lines += [f"        let container = try decoder.container(keyedBy: {KEY}.self)",
              "        guard container.allKeys.count == 1, let key = container.allKeys.first else {",
              f'            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "{name} needs exactly one variant key"))',
              "        }", "        switch key.stringValue {"]
    for v in variants:
        lines.append(f'        case "{v.tag}":')
        if v.fields is None:
            lines.append(f"            self = .{v.case}(try container.decode({v.value_type}.self, forKey: key))")
            continue
        lines.append(f"            let fields = try container.nestedContainer(keyedBy: {KEY}.self, forKey: key)")
        args = []
        for f in v.fields:
            method = "decodeIfPresent" if f.optional else "decode"
            args.append(f'{f.label}: try fields.{method}({f.type}.self, forKey: {KEY}("{f.json_name}"))')
        lines.append(f"            self = .{v.case}({', '.join(args)})")
    lines += ["        default:",
              "            self = .unknown(key.stringValue)",
              "        }", "    }", "", "    public func encode(to encoder: Encoder) throws {", "        switch self {"]
    for u in units:
        lines += [f"        case .{case_name(u)}:", "            var container = encoder.singleValueContainer()",
                  f'            try container.encode("{u}")']
    for v in variants:
        if v.fields is None:
            lines += [f"        case let .{v.case}(value):",
                      f"            var container = encoder.container(keyedBy: {KEY}.self)",
                      f'            try container.encode(value, forKey: {KEY}("{v.tag}"))']
            continue
        names = ", ".join(f.name for f in v.fields)
        lines += [f"        case let .{v.case}({names}):",
                  f"            var container = encoder.container(keyedBy: {KEY}.self)",
                  f'            var fields = container.nestedContainer(keyedBy: {KEY}.self, forKey: {KEY}("{v.tag}"))']
        for f in v.fields:
            method = "encodeIfPresent" if f.optional else "encode"
            lines.append(f'            try fields.{method}({f.name}, forKey: {KEY}("{f.json_name}"))')
    lines += ["        case let .unknown(tag):", "            var container = encoder.singleValueContainer()",
              "            try container.encode(tag)"]
    return lines + ["        }", "    }", "}"]


def render_component(schema_name, schema):
    name = type_name(schema_name)
    description = schema.get("description")
    if "oneOf" in schema:
        units, variants = [], []
        for variant in schema["oneOf"]:
            values = unit_values(variant)
            if values is None:
                variants.append(data_variant(variant))
            else:
                units += values
        if not variants:
            return render_string_enum(name, units, description)
        return render_tagged_enum(name, units, variants, description)
    kind = schema.get("type")
    if kind == "string" and "enum" in schema:
        return render_string_enum(name, schema["enum"], description)
    if kind == "object":
        return render_struct(name, object_fields(schema), description)
    if kind in ("integer", "string", "boolean"):
        return doc_lines(description) + [f"public typealias {name} = {required_type(schema)}"]
    raise SchemaError(f"no Swift declaration for {schema_name}: {schema}")
