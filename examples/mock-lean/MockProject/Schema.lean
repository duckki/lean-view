/-!
Schema declarations used by planning and validation modules.
-/

import MockProject.Schema.Types
import MockProject.Schema.Directives

namespace MockProject.Schema

/-- A field on a mock object type. -/
structure Field where
  name : String
  typeName : String
  deriving Repr

/-- A schema object with a flat field list. -/
structure ObjectType where
  name : String
  fields : List Field
  deriving Repr

/-- Returns true when an object exposes no fields. -/
def ObjectType.isEmpty (objectType : ObjectType) : Bool :=
  objectType.fields.isEmpty

end MockProject.Schema
