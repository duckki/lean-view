# Lean View Design

## Goal

Lean View is a browsing tool for Lean projects, not a replacement for reference
documentation. Its first job is to let a reader open a project, scan the basic
definitions in source order, and expand nearby proof information only when it is
useful.

## Target User

The primary user is a Lean developer reading an unfamiliar codebase or returning
to their own project after time away. They want to answer questions such as:

- What definitions are in this file?
- Which namespaces organize the file?
- What does this definition look like in source form?
- Which theorems in this file mention this definition?
- How do modules import each other?

## Interface Requirements

The application has three persistent areas on normal browsing screens:

- A compact left file explorer organized by actual `.lean` paths. Folders can be
  collapsed and expanded, and the current file is highlighted.
- A middle reading pane showing all basic definitions in the selected file as
  compact cards. The cards are grouped by namespace sections but nested
  namespaces are not rendered as nested UI.
- A right information pane showing file-level theorem summaries by default and
  selected-definition metadata after a definition card is clicked.

Definition cards show the declaration kind, short name, doc string, leading
ordinary comments, and the full source snippet. Cards are selectable and their
text remains copyable. Selecting a card updates the right pane without
navigating away from the current module or scrolling the middle pane to the top.

## Browsing Views

The module view is the primary view. It favors reading definitions in source
order over clicking through one declaration at a time.

The search view is a full-screen workflow for global discovery. It supports
searching names, theorem statements, and doc strings, with a theorem-only scope
for proof exploration.

The module map is a full-screen import graph. Nodes represent individual Lean
files and navigate back to module views.

## Presentation

Code uses an SF Mono first font stack on macOS and a light VS Code-like Lean
syntax palette. Definition snippets are rendered in boxed code blocks with
preserved whitespace. Doc strings are rendered as lightweight markdown where
ordinary line wraps are joined into paragraphs unless an explicit markdown line
break is present.

Ordinary comments are displayed as monospace text, separate from doc strings, so
readers can distinguish API prose from local source notes.

## Non-goals

Lean View does not render proof states, elaborate Lean code, execute tactics, or
replace VS Code. It also does not generate the doc-gen4 database itself yet.
Those pieces can be added later around the same static frontend contract.
