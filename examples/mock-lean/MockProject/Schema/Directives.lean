/-!
Directive declarations for conditional mock execution.
-/

namespace MockProject.Schema.Directives

/-- Built-in directive names understood by the mock. -/
inductive DirectiveName where
  | include
  | skip
  | trace
  deriving Repr

/-- A directive applied to a field or selection. -/
structure Directive where
  name : DirectiveName
  enabled : Bool
  deriving Repr

/-- Returns true when a directive suppresses execution. -/
def Directive.suppresses (directive : Directive) : Bool :=
  match directive.name with
  | DirectiveName.skip => directive.enabled
  | _ => false

end MockProject.Schema.Directives
