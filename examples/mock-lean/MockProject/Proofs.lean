/-!
Proof-oriented modules for theorem browsing demos.
-/

import MockProject.Proofs.Soundness
import MockProject.Proofs.Completeness

namespace MockProject.Proofs

/-- A named proof checkpoint. -/
structure ProofCheckpoint where
  label : String
  passed : Bool
  deriving Repr

/-- A checkpoint is valid when it passed. -/
def ProofCheckpoint.valid (checkpoint : ProofCheckpoint) : Bool :=
  checkpoint.passed

end MockProject.Proofs
