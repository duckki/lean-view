/-!
Analytics modules define events, segments, and reports.
-/

import MockProject.Analytics.Events
import MockProject.Analytics.Segments
import MockProject.Analytics.Reports

namespace MockProject.Analytics

/-- A named analytics workspace. -/
structure Workspace where
  key : String
  enabled : Bool
  deriving Repr

/-- Disabled workspaces reject new events. -/
def Workspace.acceptsEvents (workspace : Workspace) : Bool :=
  workspace.enabled

end MockProject.Analytics
