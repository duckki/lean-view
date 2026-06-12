/-!
Value language used by the mock execution engine.
-/

namespace MockProject.Core.Values

/-- Primitive values understood by the mock engine. -/
inductive Primitive where
  | string : String -> Primitive
  | number : Nat -> Primitive
  | flag : Bool -> Primitive
  deriving Repr

/-- A labeled value in a mock record. -/
structure FieldValue where
  label : String
  value : Primitive
  deriving Repr

/-- Returns whether a primitive is truthy for demo filters. -/
def Primitive.truthy : Primitive -> Bool
  | Primitive.string value => value.length > 0
  | Primitive.number value => value > 0
  | Primitive.flag value => value

/-- Boolean primitives preserve their truth value. -/
theorem Primitive.truthy_flag (value : Bool) : Primitive.truthy (Primitive.flag value) = value := by
  cases value <;> rfl

end MockProject.Core.Values
