/-!
Schema declarations used by planning and validation modules.

This module intentionally mixes short and long doc strings, plain comments,
and namespace-local notes so Lean View can demonstrate source augmentation.
-/

import MockProject.Schema.Types
import MockProject.Schema.Directives

-- A plain namespace note before the root schema namespace.
-- It should render in a monospace style rather than markdown prose.
namespace MockProject.Schema
/--
Root schema namespace note after the declaration line.

This is intentionally nonstandard placement, but useful for browsing source
files that use namespace comments as section labels.
-/

/-- A field on a mock object type. -/
structure Field where
  name : String
  typeName : String
  deriving Repr

/--
A schema object with a flat field list.
The object keeps the field order from source.
This three-line doc string checks compact card wrapping.
-/
structure ObjectType where
  name : String
  fields : List Field
  deriving Repr

/--
Returns true when an object exposes no fields.
This declaration uses a dotted local name.
The browser should match `ObjectType.isEmpty`.
The source snippet should stay attached to this definition.
-/
def ObjectType.isEmpty (objectType : ObjectType) : Bool :=
  objectType.fields.isEmpty

-- Plain declaration comment before a helper definition.
-- It should render in monospace on definition cards.
def ObjectType.fieldCount (objectType : ObjectType) : Nat :=
  objectType.fields.length

-- Plain namespace note before the nested validation namespace.
namespace Validation
/--
Validation namespace note after the declaration line.
It is intentionally placed before the declarations in this namespace.
-/

/--
Validate an object type for demo browsing.
Line two explains that empty objects fail.
Line three mentions `ObjectType.isEmpty`.
Line four keeps markdown code active.
Line five is plain prose.
Line six checks wrapping in narrow cards.
Line seven remains part of the same paragraph.
Line eight avoids list formatting.
Line nine is intentionally quiet.
Line ten closes the long doc string.
-/
def validateObject (objectType : ObjectType) : Bool :=
  !objectType.isEmpty

end Validation

/-- Sibling namespace note before the rendering namespace. -/
namespace Rendering
-- Plain namespace note after the rendering namespace declaration.

/--
Render a schema object label.
This doc string has a short second line.
It also references `ObjectType`.
The final line checks medium-length markdown.
-/
def label (objectType : ObjectType) : String :=
  objectType.name ++ " fields"

end Rendering

end MockProject.Schema
