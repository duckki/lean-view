/-!
Tracing declarations for mock execution.
-/

namespace MockProject.Execution.Tracing

/-- One trace span emitted by execution. -/
structure TraceSpan where
  name : String
  durationMs : Nat
  deriving Repr

/-- Returns true when a span has nonzero duration. -/
def TraceSpan.hasDuration (span : TraceSpan) : Bool :=
  span.durationMs > 0

/-- A zero-duration span has no duration. -/
theorem TraceSpan.zero_has_no_duration : TraceSpan.hasDuration { name := "zero", durationMs := 0 } = false := by
  rfl

end MockProject.Execution.Tracing
