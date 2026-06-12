/-!
Audience segment declarations for mock analytics.
-/

namespace MockProject.Analytics.Segments

/-- A segment predicate identified by name. -/
structure Segment where
  name : String
  active : Bool
  deriving Repr

/-- Segment groups used by the report UI. -/
inductive SegmentGroup where
  | acquisition
  | retention
  | revenue
  deriving Repr

/-- Returns true when a segment can be shown. -/
def Segment.visible (segment : Segment) : Bool :=
  segment.active

end MockProject.Analytics.Segments
