/-!
Planning declarations for mock request execution.
-/

namespace MockProject.Execution.Planning

/-- A single planned step. -/
structure PlanStep where
  label : String
  cost : Nat
  deriving Repr

/-- A sequence of planned execution steps. -/
structure ExecutionPlan where
  steps : List PlanStep
  deriving Repr

/-- Computes a simple cost from the number of steps. -/
def ExecutionPlan.cost (plan : ExecutionPlan) : Nat :=
  plan.steps.length

/-- An empty plan has zero cost. -/
theorem ExecutionPlan.cost_empty : ExecutionPlan.cost { steps := [] } = 0 := by
  rfl

end MockProject.Execution.Planning
