/-!
Analytics events are the primary demo declarations for source snippets.
-/

import MockProject.Core.Values

namespace MockProject.Analytics.Events

/-- A captured analytics event. -/
structure Event where
  name : String
  payload : List MockProject.Core.Values.FieldValue
  deriving Repr

/-- A normalized event name. -/
structure EventName where
  value : String
  deriving Repr

-- Ordinary implementation note used by Lean View.
def normalizeEvent (event : Event) : EventName :=
  { value := event.name }

/-- Normalization preserves the original event name in this mock. -/
theorem normalizeEvent_value (event : Event) : (normalizeEvent event).value = event.name := by
  rfl

end MockProject.Analytics.Events
