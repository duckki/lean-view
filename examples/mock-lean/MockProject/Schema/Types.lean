/-!
Type references for mock schema declarations.
-/

namespace MockProject.Schema.Types

/-- A compact type reference language. -/
inductive TypeRef where
  | named : String -> TypeRef
  | list : TypeRef -> TypeRef
  | optional : TypeRef -> TypeRef
  deriving Repr

/-- Returns the outermost named type when present. -/
def TypeRef.headName : TypeRef -> Option String
  | TypeRef.named name => some name
  | TypeRef.list inner => TypeRef.headName inner
  | TypeRef.optional inner => TypeRef.headName inner

/-- Named type references return their own name. -/
theorem TypeRef.headName_named (name : String) : TypeRef.headName (TypeRef.named name) = some name := by
  rfl

end MockProject.Schema.Types
