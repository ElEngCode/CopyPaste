# Plan Roadmap

## 001. Audit and initialize project workspace

Goal: Inspect the existing project at F:/Projects/CopyPaste/Projects/gbbbbbbbb, confirm whether it is empty or partially implemented, and add the master plan as project documentation without overwriting useful existing work.
Why: Codex needs a clean starting point and must not accidentally destroy existing files. The master plan should remain available inside the repository for later implementation decisions.
Dependencies: none
Parallel group: none

Target files:
- MASTER_PLAN.md
- README.md
- .gitignore

Research needed:
- Inspect the current directory tree
- Check whether package.json already exists
- Check whether src/ already exists
- Identify any existing framework or build setup

Acceptance criteria:
- Existing project state is understood before changes are made
- MASTER_PLAN.md contains the provided Super master plan
- README.md identifies the project as Super and explains how to install, test, build, and run it
- No existing user code is deleted without replacement

Verification commands:
- git status --short
- dir
- if exist MASTER_PLAN.md type MASTER_PLAN.md

## 002. Scaffold Vite React Three.js app

Goal: Create or normalize the project as a Vite React app with Three.js, Vitest, and reliable npm scripts for development, testing, and production build.
Why: The spinning ball demo needs a stable web app foundation before rendering, controls, or tests can be added.
Dependencies: roadmap_1
Parallel group: none

Target files:
- package.json
- vite.config.js
- index.html
- src/main.jsx
- src/app/App.jsx
- src/app/layout.css

Research needed:
- Check existing package.json scripts and dependencies
- Confirm whether JavaScript or TypeScript is already being used
- Inspect current src entrypoints before replacing or editing

Acceptance criteria:
- npm install succeeds
- npm run dev starts the Vite app
- npm run build produces a production build
- npm run test runs Vitest
- npm run desktop:test exists and runs the main local verification suite

Verification commands:
- npm.cmd install
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 003. Build focused application shell

Goal: Implement the main page layout with project title, centered render canvas area, control panel area, simple instructions, loading/fallback messaging, and responsive sizing.
Why: A polished demo needs a clear user-facing structure around the 3D scene instead of a raw canvas dropped onto the page.
Dependencies: roadmap_2
Parallel group: none

Target files:
- src/app/App.jsx
- src/app/layout.css
- src/controls/ControlPanel.jsx

Research needed:
- Inspect App.jsx and current CSS structure
- Check how the canvas will be mounted into the React layout
- Review responsive behavior at desktop and narrow viewport widths

Acceptance criteria:
- The app shows the Super title
- The 3D canvas container is centered and visually dominant
- The control panel area is present but can use placeholder controls initially
- The layout remains usable on desktop and mobile-width screens
- There are no horizontal scrollbars caused by the layout

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 004. Create Three.js rendering foundation

Goal: Implement reusable scene, camera, renderer, lighting, resize handling, render loop setup, and cleanup functions for React integration.
Why: The visual demo depends on a stable rendering layer that handles browser resizing, device pixel ratio, and resource cleanup correctly.
Dependencies: roadmap_3
Parallel group: none

Target files:
- src/scene/createScene.js
- src/scene/createCamera.js
- src/scene/createRenderer.js
- src/scene/createLights.js
- src/scene/resizeRenderer.js
- src/animation/animationLoop.js
- src/app/App.jsx

Research needed:
- Inspect the canvas mounting approach in App.jsx
- Confirm Three.js dependency is installed
- Check whether StrictMode causes double-mount cleanup issues in development

Acceptance criteria:
- A Three.js scene renders inside the app canvas container
- Camera framing is stable and ready for a centered ball
- Renderer resizes with the container/window
- Lights are visible and suitable for showing sphere depth
- Animation frame cleanup happens on unmount
- No duplicate canvases appear after React remounts

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 005. Implement polished ball system

Goal: Create the 3D ball with sphere geometry, visually clear material, surface markings or generated texture, correct scale, centered placement, and optional shadow-ready configuration.
Why: A plain sphere can rotate without looking like it spins. The ball needs visible detail, depth, and polish to satisfy the core product goal.
Dependencies: roadmap_4
Parallel group: none

Target files:
- src/ball/createBall.js
- src/ball/ballMaterials.js
- src/ball/ballTexture.js
- public/textures/ball-pattern.png
- src/app/App.jsx

Research needed:
- Inspect available texture assets, if any
- Decide whether to generate markings procedurally or use a public texture asset
- Check lighting and camera distance from the rendering foundation

Acceptance criteria:
- A centered 3D ball is visible in the scene
- The ball has clear surface detail that makes rotation obvious
- The material reacts to light and looks three-dimensional
- The ball remains visually clear against the background
- No missing texture errors appear in the browser console

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 006. Build pure spin controller

Goal: Implement frame-rate-independent spin state logic with play/pause, reset, speed clamping, direction switching, axis switching, and delta-time update behavior.
Why: Spin behavior should be testable outside Three.js so controls and animation remain reliable and easy to extend.
Dependencies: roadmap_2
Parallel group: core_parallel

Target files:
- src/spin/spinController.js
- src/spin/spinConfig.js
- src/tests/spinController.test.js

Research needed:
- Review desired minSpeed and maxSpeed values
- Check whether rotation should be represented as Euler values, axis vectors, or simple state
- Confirm Vitest setup and test file conventions

Acceptance criteria:
- Spin controller exposes initial state creation
- Speed is clamped between configured min and max values
- Pause stops rotation updates
- Play resumes rotation updates
- Reset returns rotation and speed/direction/axis to defaults
- Direction toggle reverses rotation sign
- Axis switching affects the intended rotation component
- Unit tests cover delta-time update behavior

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 007. Connect animation loop to ball rotation

Goal: Wire the spin controller into the Three.js animation loop so the ball rotates smoothly using delta time and current spin state.
Why: The main experience depends on smooth, stable, frame-rate-independent motion rather than fixed-per-frame rotation.
Dependencies: roadmap_5, roadmap_6
Parallel group: none

Target files:
- src/animation/animationLoop.js
- src/app/App.jsx
- src/spin/spinController.js
- src/ball/createBall.js

Research needed:
- Inspect current render loop implementation
- Confirm how spin state is stored and updated from React controls
- Check whether requestAnimationFrame timestamps are used

Acceptance criteria:
- The ball spins continuously when playing
- The ball stops visually when paused
- Rotation is based on elapsed delta time
- Long frame gaps are safely capped to avoid sudden jumps
- The render loop does not create memory leaks or multiple competing loops

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 008. Implement user control panel

Goal: Add working play/pause, reset, speed slider, direction toggle, and axis selector controls connected to the spin controller and visible app state.
Why: The demo must be controllable without confusing the user, and each core interaction must work reliably.
Dependencies: roadmap_7
Parallel group: none

Target files:
- src/controls/ControlPanel.jsx
- src/controls/inputHandlers.js
- src/app/App.jsx
- src/spin/spinController.js
- src/app/layout.css

Research needed:
- Inspect current placeholder control panel
- Review spin controller API
- Check accessibility expectations for buttons, sliders, and selects

Acceptance criteria:
- Play/pause button toggles animation state reliably
- Reset returns the ball to the initial orientation and default control values
- Speed slider updates spin speed immediately
- Direction toggle clearly switches clockwise/counter-clockwise or forward/reverse behavior
- Axis selector supports X, Y, Z, and at least one combined/natural axis if implemented
- Controls have clear labels and keyboard-accessible native inputs

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 009. Add visual polish and scene finishing

Goal: Refine background, lighting, camera framing, material tuning, shadows or grounding reference, spacing, and UI styling so the demo feels finished rather than prototype-like.
Why: The stated goal is a polished, pleasant, stable spinning ball demo, not only functional rotation.
Dependencies: roadmap_8
Parallel group: none

Target files:
- src/app/layout.css
- src/scene/createLights.js
- src/scene/createCamera.js
- src/scene/createRenderer.js
- src/ball/ballMaterials.js
- src/ball/createBall.js

Research needed:
- Review the app visually at multiple viewport sizes
- Inspect lighting balance and material readability
- Check whether shadows or a subtle ground/reference plane improve depth without distraction

Acceptance criteria:
- The ball is easy to see and visually satisfying
- Surface markings make rotation obvious at all supported speeds
- Lighting shows clear depth without overexposure or flatness
- Background is clean and not distracting
- The scene remains centered and well-framed after resize
- UI controls look intentional and aligned with the demo style

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 010. Add rendering lifecycle and resize tests

Goal: Add targeted tests or testable utilities for renderer resize behavior, spin lifecycle assumptions, and cleanup-safe animation loop behavior where practical.
Why: Rendering bugs often appear as leaks, duplicate loops, incorrect canvas sizing, or broken resize behavior. These should be guarded by tests where feasible.
Dependencies: roadmap_7
Parallel group: quality_parallel

Target files:
- src/scene/resizeRenderer.js
- src/animation/animationLoop.js
- src/tests/resizeRenderer.test.js
- src/tests/animationLoop.test.js

Research needed:
- Inspect current test setup limitations with Three.js and jsdom
- Identify which rendering utilities can be tested without a real WebGL context
- Review animation loop API for testability

Acceptance criteria:
- Resize utility has automated coverage for width, height, and camera aspect updates
- Animation loop utility can be started and stopped predictably in tests
- Tests avoid requiring a real browser WebGL context unless already configured
- Existing spin controller tests still pass

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 011. Add manual QA checklist

Goal: Create a concise manual verification checklist covering smoothness, controls, visual clarity, resize behavior, long-running stability, and browser sanity checks.
Why: Visual rendering quality cannot be fully proven by unit tests, so manual QA needs to be explicit and repeatable.
Dependencies: roadmap_8
Parallel group: quality_parallel

Target files:
- README.md
- docs/MANUAL_QA.md

Research needed:
- Review success criteria from MASTER_PLAN.md
- Inspect implemented controls and visual features
- Identify target browsers for manual verification

Acceptance criteria:
- Manual QA checklist includes launch steps
- Checklist covers play, pause, reset, speed, direction, and axis controls
- Checklist covers resizing and mobile-width layout
- Checklist includes a long-running stability observation
- Checklist includes performance and browser-console checks

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 012. Performance and stability pass

Goal: Review and optimize render loop behavior, object allocation, event listeners, device pixel ratio, canvas sizing, and cleanup to keep the demo stable during long-running use.
Why: Smoothness and stability are primary success criteria, especially for an animation that may run indefinitely.
Dependencies: roadmap_9
Parallel group: none

Target files:
- src/app/App.jsx
- src/animation/animationLoop.js
- src/scene/createRenderer.js
- src/scene/resizeRenderer.js
- src/ball/createBall.js

Research needed:
- Inspect browser console for warnings or repeated initialization
- Check whether objects are allocated every frame
- Review event listener cleanup
- Review renderer pixel ratio and antialias settings

Acceptance criteria:
- No avoidable objects are created every animation frame
- Resize listeners are cleaned up correctly
- Renderer pixel ratio is capped to a sensible value for performance
- No duplicate requestAnimationFrame loops run at the same time
- The app remains smooth after extended running
- Production build still works

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 013. Finalize README and developer workflow

Goal: Update documentation with installation, development, testing, build, project structure, controls, design intent, and troubleshooting notes.
Why: The project should be buildable, testable, and understandable without broken setup steps or hidden knowledge.
Dependencies: roadmap_12, roadmap_11
Parallel group: none

Target files:
- README.md
- MASTER_PLAN.md
- package.json

Research needed:
- Inspect final scripts in package.json
- Review actual project structure
- Confirm implemented controls and features match documentation

Acceptance criteria:
- README has correct npm install, dev, test, build, and desktop:test commands
- README describes the app controls accurately
- README summarizes the architecture in plain language
- README includes troubleshooting for missing dependencies or blank WebGL canvas
- Documentation does not claim optional enhancements that were not implemented

Verification commands:
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test

## 014. Final release verification

Goal: Run the full verification suite, inspect the production build, fix any final regressions, and leave the repository in a clean committable state.
Why: The final deliverable must launch reliably and feel complete, with no broken setup or obvious quality gaps.
Dependencies: roadmap_13
Parallel group: none

Target files:
- package.json
- README.md
- src/app/App.jsx
- src/app/layout.css
- src/scene/createScene.js
- src/ball/createBall.js
- src/spin/spinController.js
- src/controls/ControlPanel.jsx

Research needed:
- Run all project scripts
- Inspect production build output
- Review git diff for accidental unrelated changes
- Check the manual QA checklist against the final app

Acceptance criteria:
- npm install has no unresolved dependency issues
- All automated tests pass
- Production build succeeds
- desktop:test succeeds
- Manual QA checklist has no unresolved critical failures
- git status shows only intentional project files changed

Verification commands:
- npm.cmd install
- npm.cmd run test -- --run
- npm.cmd run build
- npm.cmd run desktop:test
- git status --short
