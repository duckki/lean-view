/-!
Identifier helpers for mock operations and records.
-/

namespace MockProject.Core.Identifiers

/-- A stable identifier for a mock entity. -/
structure EntityId where
  namespace : String
  value : String
  deriving Repr

/-- A generated request identifier. -/
structure RequestId where
  value : String
  deriving Repr

/-- Builds a readable identifier. -/
def EntityId.render (id : EntityId) : String :=
  id.namespace ++ ":" ++ id.value

/-- The empty identifier has an empty rendered suffix. -/
theorem EntityId.render_empty : EntityId.render { namespace := "mock", value := "" } = "mock:" := by
  rfl

end MockProject.Core.Identifiers
