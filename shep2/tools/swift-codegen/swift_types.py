"""Maps a JSON Schema (as schemars writes it) to a Swift type expression."""

from names import SchemaError, type_name

REF_PREFIX = "#/components/schemas/"
NULL = "null"
# 64-bit formats keep their width; everything else (counts, hours, parallelism) is an `Int`,
# which is 64-bit on every platform the app runs on.
WIDE_INTEGERS = {"int64": "Int64", "uint64": "Int64"}
PRIMITIVES = {"string": "String", "boolean": "Bool"}
# The type of a `null` result, like `agent.send`'s.
NULL_TYPE = "RPCNull"


def ref_name(ref):
    if not ref.startswith(REF_PREFIX):
        raise SchemaError(f"unsupported $ref {ref}")
    return ref[len(REF_PREFIX):]


def nullable_inner(schema):
    """The non-null half of `anyOf: [X, null]` or `type: [X, "null"]`, else None."""
    any_of = schema.get("anyOf")
    if any_of and len(any_of) == 2 and {"type": NULL} in any_of:
        return next(s for s in any_of if s != {"type": NULL})
    types = schema.get("type")
    if isinstance(types, list) and NULL in types and len(types) == 2:
        inner = dict(schema)
        inner["type"] = next(t for t in types if t != NULL)
        return inner
    return None


def swift_type(schema):
    """`(type, optional)` for a property or result schema."""
    inner = nullable_inner(schema)
    if inner is not None:
        return swift_type(inner)[0], True
    return required_type(schema), False


def required_type(schema):
    if "$ref" in schema:
        return type_name(ref_name(schema["$ref"]))
    kind = schema.get("type")
    if kind in PRIMITIVES:
        return PRIMITIVES[kind]
    if kind == "integer":
        return WIDE_INTEGERS.get(schema.get("format"), "Int")
    if kind == "array":
        item, optional = swift_type(schema.get("items", {}))
        return f"[{item}?]" if optional else f"[{item}]"
    if kind == NULL:
        return NULL_TYPE
    raise SchemaError(f"no Swift type for schema {schema}")


def spelled(schema):
    """The type as written in code: `Brief?` for an optional one."""
    name, optional = swift_type(schema)
    return f"{name}?" if optional else name
