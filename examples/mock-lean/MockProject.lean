/-!
MockProject is a synthetic Lean workspace for demonstrating Lean View.

It models a small analytics and execution domain with enough modules and
namespaces to exercise file browsing, declaration search, source snippets, and
the import graph.
-/

import MockProject.Core
import MockProject.Schema
import MockProject.Analytics
import MockProject.Execution
import MockProject.Proofs

namespace MockProject

/-- Top-level project marker used by examples. -/
structure ProjectInfo where
  name : String
  moduleCount : Nat
  deriving Repr

/-- Default metadata for the mock project. -/
def defaultInfo : ProjectInfo :=
  { name := "MockProject", moduleCount := 18 }

/-- A simple theorem-shaped declaration for search demos. -/
theorem defaultInfo_name : defaultInfo.name = "MockProject" := by
  rfl

end MockProject
