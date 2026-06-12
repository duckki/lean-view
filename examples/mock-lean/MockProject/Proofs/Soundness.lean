/-!
Soundness-shaped theorem declarations for search and related theorem demos.
-/

import MockProject.Execution.Planning

namespace MockProject.Proofs.Soundness

/-- A proof witness for an execution plan. -/
structure SoundnessWitness where
  plan : MockProject.Execution.Planning.ExecutionPlan
  accepted : Bool
  deriving Repr

/-- Soundness witnesses accept empty plans in the mock. -/
def acceptsEmptyPlan : SoundnessWitness :=
  { plan := { steps := [] }, accepted := true }

/-- The empty plan witness is accepted. -/
theorem acceptsEmptyPlan_sound : acceptsEmptyPlan.accepted = true := by
  rfl

end MockProject.Proofs.Soundness
