# Changelog

All notable changes to Civic Engine are documented here.

The format follows the principles of
[Keep a Changelog](https://keepachangelog.com/), and versions follow
Semantic Versioning.

## Released 

## [1.1.1] - 2026-08-13

### Added

- Added `@civic-engine/headless`, a presentation-agnostic controller
  for Civic Engine decision navigation.
- Added framework-independent access to Civic Engine navigation state,
  including:
  - current node state
  - decision flags
  - navigation history
  - back navigation
  - restart/reset
  - session lifecycle
  - persisted local state
- Added a subscription interface allowing host applications to react
  to decision-state changes without depending on a specific UI
  framework.
- Added a presentation-neutral `getView()` interface exposing the
  current evaluated question or terminal result to host applications.

### Changed

- Refactored `CivicShell` so that decision-navigation and session
  state management can be separated from DOM rendering.
- Established a headless runtime boundary between Civic Engine's
  decision execution and its presentation layer.
- Positioned `CivicShell` as a reference UI implementation rather than
  the required presentation layer for Civic Engine.

### Architecture

- Civic Engine decision logic can now be consumed independently of
  the presentation layer.
- The headless controller provides the foundation for future adapters
  for React, Vue, Svelte, Web Components, and other presentation or
  delivery environments.
