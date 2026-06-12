/-!
Completeness-shaped theorem declarations for proof browsing demos.
-/

namespace MockProject.Proofs.Completeness

/-- Completeness scenario names used in the mock. -/
inductive Scenario where
  | base
  | recursive
  | boundary
  deriving Repr

/-- Returns true for scenarios covered by the mock proof. -/
def Scenario.covered : Scenario -> Bool
  | Scenario.base => true
  | Scenario.recursive => true
  | Scenario.boundary => true

/-- The base scenario is covered. -/
theorem base_covered : Scenario.covered Scenario.base = true := by
  rfl

end MockProject.Proofs.Completeness
