# SwitchGPT Desktop Tool UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the Vue/Tauri interface as a compact, precise configuration switcher while preserving every configuration operation.

**Architecture:** Keep existing `AppState`, event handlers, Naive UI components, and Tauri API calls. Limit changes to global tokens, application chrome, and the two existing presentation components; `ProfileCard` remains the action boundary but renders as a list row instead of an elevated card.

**Tech Stack:** Vue 3.5, TypeScript, Tailwind CSS 4, Naive UI 2, Vite, Tauri 2.

## Global Constraints

- Add no dependencies, routes, APIs, state, command palette, search, or data-model changes.
- Use an opaque neutral surface, a single indigo action color, semantic green/red only for success/error, 4–8px radii, and hairline dividers.
- Preserve capture, apply, restart, rename, delete, settings save, toast, confirmation, busy, and responsive behaviors.
- Do not run `pnpm tauri build`; UI acceptance requires `pnpm dev:tauri` and user confirmation after static checks.
- The repository has no frontend test runner and this change adds no new business logic; use `pnpm typecheck`, `pnpm build`, `git diff --check`, and the live Tauri window as verification.

---

### Task 1: Establish global tool-surface tokens

**Files:**
- Modify: `src/style.css:5-50`
- Modify: `src/theme.ts:3-22`
- Test: `pnpm typecheck` and `pnpm build`

**Interfaces:**
- Consumes: existing `.panel`, `.muted`, `themeOverrides`, and `.dark` class.
- Produces: opaque light/dark `--app-bg`, `--panel-bg`, `--panel-border`, and Naive UI indigo/radius tokens used by all existing Vue views.

- [ ] **Step 1: Verify the baseline compiler state**

Run: `pnpm typecheck`

Expected: exit code 0 before visual-token changes.

- [ ] **Step 2: Replace decorative global surface styling**

In `src/style.css`, remove the two `radial-gradient(...)` layers and `backdrop-filter`. Set opaque neutral backgrounds and explicit hairline borders for both themes. Keep the existing typography and `.muted` API unchanged.

In `src/theme.ts`, change the primary token family from violet to indigo and reduce `Card.borderRadius` from 16px to 8px without changing any component imports or Naive UI behavior.

- [ ] **Step 3: Verify static compilation**

Run: `pnpm typecheck; pnpm build`

Expected: both commands exit 0.

- [ ] **Step 4: Commit**

```powershell
git add src/style.css src/theme.ts
git commit -m "🎨 style(switchgpt): 收敛为精密工具视觉令牌"
```

### Task 2: Simplify persistent navigation chrome

**Files:**
- Modify: `src/App.vue:75-98`
- Test: `pnpm typecheck`

**Interfaces:**
- Consumes: `view` ref and existing profile/settings click handlers.
- Produces: the same two navigation targets with compact, non-gradient desktop chrome and unchanged mobile buttons.

- [ ] **Step 1: Verify the baseline compiler state**

Run: `pnpm typecheck`

Expected: exit code 0 before changing `App.vue` classes.

- [ ] **Step 2: Replace branded decoration with compact navigation**

Remove the gradient logo treatment, reduce sidebar padding and visual weight, and use a text navigation selection with a slim indigo marker. Keep both buttons as semantic `button` elements and retain their existing `@click` assignments and mobile fallback.

- [ ] **Step 3: Verify static compilation**

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 4: Commit**

```powershell
git add src/App.vue
git commit -m "🎨 style(switchgpt): 精简桌面导航框架"
```

### Task 3: Convert profile cards into compact configuration rows

**Files:**
- Modify: `src/views/ProfilesView.vue:152-211`
- Modify: `src/components/ProfileCard.vue:1-63`
- Test: `pnpm typecheck` and `pnpm build`

**Interfaces:**
- Consumes: `ProfileSummary`, `active`, `busy`, and the existing `apply`, `rename`, `remove` emitted events.
- Produces: an accessible profile list with headings on wide windows and vertically readable rows on narrow windows; all event signatures stay unchanged.

- [ ] **Step 1: Verify the baseline compiler state**

Run: `pnpm typecheck`

Expected: exit code 0 before replacing the profile presentation.

- [ ] **Step 2: Create the compact current-context header**

Replace the three summary cards with one bordered context strip. It must display the current profile name, Codex running state, and auto-restart state. Keep `state.profiles`, `state.codex.running`, and `state.settings.auto_restart` as the only data sources.

- [ ] **Step 3: Make restart progress conditional**

Wrap the existing restart panel in `v-if="restartStage !== 'idle'"`. Keep the existing `stageText`, `progress`, status mapping, event listener, and error message behavior unchanged.

- [ ] **Step 4: Render list labels and rows**

Add a desktop-only header for name, model, Provider, reasoning, status, and actions above the existing `v-for`. In `ProfileCard.vue`, replace `NCard` with an `article` grid using those same fields; use an indigo left edge and a small tag for the active row. Preserve all three buttons and their disabled/event bindings. On smaller widths, use responsive grid classes to stack the metadata without hiding it.

- [ ] **Step 5: Verify static compilation and production frontend build**

Run: `pnpm typecheck; pnpm build`

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add src/views/ProfilesView.vue src/components/ProfileCard.vue
git commit -m "🎨 style(switchgpt): 将档案改为紧凑配置列表"
```

### Task 4: Align the settings surface and visually verify the desktop app

**Files:**
- Modify: `src/views/SettingsView.vue:48-76`
- Test: `git diff --check`, `pnpm typecheck`, `pnpm build`, `pnpm dev:tauri`

**Interfaces:**
- Consumes: existing reactive `form`, `save` method, and `state.paths`.
- Produces: settings visual hierarchy aligned with the profile list while retaining all field bindings and saves.

- [ ] **Step 1: Verify the baseline compiler state**

Run: `pnpm typecheck`

Expected: exit code 0 before class-only settings changes.

- [ ] **Step 2: Reduce settings panel decoration**

Replace `rounded-3xl` shells with compact bordered sections that use the shared `.panel` tokens. Do not modify `v-model`, form fields, `save`, emitted events, copy, or data-path rendering.

- [ ] **Step 3: Run static verification**

Run: `git diff --check; pnpm typecheck; pnpm build`

Expected: all commands exit 0.

- [ ] **Step 4: Start or continue the Tauri development app**

Run: `pnpm dev:tauri`

Expected: Vite serves `http://localhost:5173` and the Tauri debug window launches. Check the profiles and settings pages in both themes, confirm the empty restart panel is absent, and exercise capture, apply, rename, delete, and restart controls without claiming final UI acceptance until the user confirms the window.

- [ ] **Step 5: Commit**

```powershell
git add src/views/SettingsView.vue
git commit -m "🎨 style(switchgpt): 统一设置页工具化层级"
```
