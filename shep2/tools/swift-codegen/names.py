"""How schema names become Swift names."""

# Schema names that would shadow something Swift code needs. `Task` would hide
# Swift concurrency's `Task` everywhere the models are imported.
TYPE_RENAMES = {"Task": "ShepTask"}

SWIFT_KEYWORDS = {
    "Any", "Type", "as", "associatedtype", "break", "case", "catch", "class", "continue",
    "default", "defer", "deinit", "do", "else", "enum", "extension", "fallthrough", "false",
    "fileprivate", "for", "func", "guard", "if", "import", "in", "init", "inout", "internal",
    "is", "let", "nil", "operator", "private", "protocol", "public", "repeat", "rethrows",
    "return", "self", "Self", "static", "struct", "subscript", "super", "switch", "throw",
    "throws", "true", "try", "typealias", "var", "where", "while",
}


class SchemaError(Exception):
    """The schema uses a shape the generator does not know. Fail rather than guess."""


def escape(name):
    return f"`{name}`" if name in SWIFT_KEYWORDS else name


def lower_first(name):
    return name[:1].lower() + name[1:]


def upper_first(name):
    return name[:1].upper() + name[1:]


def camel(parts):
    parts = [p for p in parts if p]
    return lower_first(parts[0]) + "".join(upper_first(p) for p in parts[1:])


def field_name(snake):
    """`needs_you` -> `needsYou`."""
    return escape(camel(snake.split("_")))


def case_name(variant):
    """`NeedsYou` -> `needsYou`."""
    return escape(lower_first(variant))


def method_name(method):
    """`day.first_run` -> `dayFirstRun`."""
    return escape(camel([p for part in method.split(".") for p in part.split("_")]))


def params_type(method):
    """`settings.update` -> `SettingsUpdateParams`."""
    return upper_first(method_name(method).strip("`")) + "Params"


def type_name(schema_name):
    return TYPE_RENAMES.get(schema_name, schema_name)


def doc_lines(text, indent=""):
    if not text:
        return []
    return [f"{indent}/// {line}".rstrip() for line in text.splitlines()]
