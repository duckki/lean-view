/-!
Report declarations connect events and segments.
-/

import MockProject.Analytics.Events
import MockProject.Analytics.Segments

namespace MockProject.Analytics.Reports

/-- A report card shown in a dashboard. -/
structure ReportCard where
  title : String
  eventName : String
  deriving Repr

/-- Builds a report title from a segment name. -/
def reportTitle (segment : MockProject.Analytics.Segments.Segment) : String :=
  "Segment " ++ segment.name

/-- Event reports use the normalized event value. -/
def eventReport (event : MockProject.Analytics.Events.Event) : ReportCard :=
  { title := "Event", eventName := (MockProject.Analytics.Events.normalizeEvent event).value }

end MockProject.Analytics.Reports
