/-!
Resolver declarations for mock execution.
-/

import MockProject.Core.Context

namespace MockProject.Execution.Resolvers

/-- A resolver input value. -/
structure ResolverInput where
  fieldName : String
  context : MockProject.Core.Context.RequestContext
  deriving Repr

/-- A resolver output value. -/
structure ResolverOutput where
  value : String
  cached : Bool
  deriving Repr

/-- Resolves a field by echoing its name. -/
def resolveField (input : ResolverInput) : ResolverOutput :=
  { value := input.fieldName, cached := false }

end MockProject.Execution.Resolvers
