# Compact Conversion Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the loaded-file summary, conversion controls, file actions, and primary action in one compact horizontal row.

**Architecture:** Keep the existing `Dropzone` API and callbacks unchanged. Restructure only the loaded-state markup into one non-wrapping flex row with horizontal overflow as the narrow-screen fallback.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Lock the one-row structure with a component test

**Files:**
- Create: `frontend/src/components/conversion/Dropzone.test.tsx`
- Modify: `frontend/src/components/conversion/Dropzone.tsx`

- [x] **Step 1: Write the failing test**

Render the loaded state and assert that the summary, center controls, secondary toolbar, and conversion action all belong to the same row container.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `cd frontend && npx vitest run src/components/conversion/Dropzone.test.tsx`

Expected: FAIL because the loaded-state one-row test IDs and structure do not exist yet.

- [x] **Step 3: Implement the compact row**

Replace the two stacked loaded-state sections with one `flex-nowrap` row. Preserve every callback and add horizontal overflow on the outer loaded-state container.

- [x] **Step 4: Verify the focused test and frontend build**

Run: `cd frontend && npx vitest run src/components/conversion/Dropzone.test.tsx`

Expected: PASS.

Run: `cd frontend && npx vite build`

Expected: production bundle completes successfully.

- [x] **Step 5: Verify in Electron**

Run `npm run dev`, load files, and confirm the header controls remain in one row without clipped actions.
