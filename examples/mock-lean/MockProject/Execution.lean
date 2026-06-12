/-!
Execution modules plan, resolve, and trace mock requests.
-/

import MockProject.Execution.Planning
import MockProject.Execution.Resolvers
import MockProject.Execution.Tracing

namespace MockProject.Execution

/-- Result status for mock execution. -/
inductive ExecutionStatus where
  | completed
  | skipped
  | failed
  deriving Repr

/-- Returns true when execution finished successfully. -/
def ExecutionStatus.isSuccess : ExecutionStatus -> Bool
  | ExecutionStatus.completed => true
  | _ => false

end MockProject.Execution
