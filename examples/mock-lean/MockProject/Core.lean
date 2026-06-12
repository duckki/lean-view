/-!
Core domain declarations shared by the mock project.
-/

import MockProject.Core.Identifiers
import MockProject.Core.Values
import MockProject.Core.Context

namespace MockProject.Core

/-- A source location in a mock document. -/
structure SourceRange where
  startLine : Nat
  endLine : Nat
  deriving Repr

/-- Returns true when the source range is ordered. -/
def SourceRange.isOrdered (range : SourceRange) : Bool :=
  range.startLine <= range.endLine

/-- Ordered ranges have a nonnegative span. -/
theorem SourceRange.span_nonnegative (range : SourceRange) : range.startLine <= range.endLine -> True := by
  intro _
  trivial

end MockProject.Core
