/-!
Request context data threaded through mock execution.
-/

import MockProject.Core.Identifiers

namespace MockProject.Core.Context

/-- The user visible execution mode. -/
inductive ExecutionMode where
  | preview
  | production
  | audit
  deriving Repr

/-- Context for one mock request. -/
structure RequestContext where
  requestId : MockProject.Core.Identifiers.RequestId
  mode : ExecutionMode
  deriving Repr

/-- Audit mode enables additional tracing. -/
def ExecutionMode.tracingEnabled : ExecutionMode -> Bool
  | ExecutionMode.audit => true
  | _ => false

/-- Preview mode does not enable tracing. -/
theorem preview_tracing_disabled : ExecutionMode.tracingEnabled ExecutionMode.preview = false := by
  rfl

end MockProject.Core.Context
