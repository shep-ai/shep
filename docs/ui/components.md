# Component Catalog

Reference for all available UI components in the Shep AI web interface.

## Tier 0: UI Primitives (`components/ui/`)

shadcn/ui primitives managed by the shadcn CLI. Most have colocated `.stories.tsx` files.

| Component         | File                      | Description                                                                   |
| ----------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Accordion         | `accordion.tsx`           | Collapsible content sections                                                  |
| AlertDialog       | `alert-dialog.tsx`        | Confirmation dialogs for destructive actions                                  |
| Alert             | `alert.tsx`               | Feedback messages with semantic variants (`default`, `destructive`)           |
| Badge             | `badge.tsx`               | Status indicators (`default`, `secondary`, `outline`, `destructive`)          |
| Button            | `button.tsx`              | Action buttons (`default`, `destructive`, `outline`, `ghost`, `link` + sizes) |
| Card              | `card.tsx`                | Container with header, content, footer sections                               |
| CheckboxGroup     | `checkbox-group.tsx`      | Grouped checkbox inputs                                                       |
| CheckboxGroupItem | `checkbox-group-item.tsx` | Individual item within checkbox group                                         |
| Checkbox          | `checkbox.tsx`            | Single checkbox input                                                         |
| CometSpinner      | `comet-spinner.tsx`       | Animated comet-style loading spinner                                          |
| Command           | `command.tsx`             | Command palette / combobox primitive                                          |
| Dialog            | `dialog.tsx`              | Modal dialogs for focused interactions                                        |
| Drawer            | `drawer.tsx`              | Slide-out drawer panel                                                        |
| DropdownMenu      | `dropdown-menu.tsx`       | Dropdown menu with items                                                      |
| Input             | `input.tsx`               | Text input fields                                                             |
| Label             | `label.tsx`               | Accessible form field labels                                                  |
| Popover           | `popover.tsx`             | Floating content panels                                                       |
| ScrollArea        | `scroll-area.tsx`         | Custom scrollable container                                                   |
| Select            | `select.tsx`              | Dropdown selection                                                            |
| Separator         | `separator.tsx`           | Visual divider                                                                |
| Sheet             | `sheet.tsx`               | Side sheet overlay                                                            |
| Sidebar           | `sidebar.tsx`             | Sidebar primitive (shadcn sidebar component)                                  |
| Skeleton          | `skeleton.tsx`            | Loading placeholder skeleton                                                  |
| Sonner            | `sonner.tsx`              | Toast notifications (via `sonner` library)                                    |
| Spinner           | `spinner.tsx`             | Loading spinner                                                               |
| Switch            | `switch.tsx`              | Toggle switch                                                                 |
| Tabs              | `tabs.tsx`                | Tabbed content navigation                                                     |
| Textarea          | `textarea.tsx`            | Multi-line text input                                                         |
| Tooltip           | `tooltip.tsx`             | Hover tooltip                                                                 |

### Usage

```typescript
// Import directly from the component file
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
```

### Adding New Primitives

```bash
pnpm dlx shadcn@latest add [component-name]
```

## Tier 1: Common Components (`components/common/`)

Cross-feature composed components built from ui/ primitives. Each lives in its own subfolder with colocated stories and `index.ts` barrel export.

### ActionButton

Styled action button with icon support.

- **Path**: `common/action-button/`

### AddRepositoryButton

Button to add a new repository to the workspace.

- **Path**: `common/add-repository-button/`

### AttachmentCard

Card display for file attachments.

- **Path**: `common/attachment-card/`

### AttachmentChip

Compact chip display for inline attachment references.

- **Path**: `common/attachment-chip/`

### BaseDrawer

Base drawer component used as foundation for all drawer variants.

- **Path**: `common/base-drawer/`

### CiStatusBadge

Badge showing CI/CD pipeline status.

- **Path**: `common/ci-status-badge/`

### ControlCenterDrawer

Orchestrator for drawer views (feature, repository, create).

- **Path**: `common/control-center-drawer/`
- **Contains**: `create-drawer-client.tsx`, `feature-drawer-client.tsx`, `repository-drawer-client.tsx`, `drawer-view.ts`

### DeleteFeatureDialog

Confirmation dialog for feature deletion.

- **Path**: `common/delete-feature-dialog/`

### DeploymentStatusBadge

Badge showing deployment status.

- **Path**: `common/deployment-status-badge/`

### DrawerActionBar

Action bar within drawers (approve, reject, etc.).

- **Path**: `common/drawer-action-bar/`

### DrawerRevisionInput

Input for revision/feedback text within drawers.

- **Path**: `common/drawer-revision-input/`

### EditorTypeIcons

Icon mappings for different editor/IDE types.

- **Path**: `common/editor-type-icons.tsx` (single file, not a subfolder)

### ElapsedTime

Live-updating elapsed time display.

- **Path**: `common/elapsed-time/`

### EmptyState

Placeholder for pages or sections with no content.

- **Path**: `common/empty-state/`
- **Props**: `icon?` (Lucide icon), `title` (required), `description?`, `action?` (ReactNode)

### FeatureCreateDrawer

Drawer form for creating new features with attachments.

- **Path**: `common/feature-create-drawer/`

### FeatureDrawer

Feature detail drawer with tabbed content.

- **Path**: `common/feature-drawer/`

### FeatureDrawerTabs

Tab navigation for the feature drawer (overview, activity, approval, rejection, pr-info, deployment, timeline).

- **Path**: `common/feature-drawer-tabs/`

### FeatureListItem

Sidebar list item representing a feature with status and elapsed time.

- **Path**: `common/feature-list-item/`

### FeatureNode

React Flow canvas node representing a feature with state-driven styling.

- **Path**: `common/feature-node/`

### FeatureStatusBadges

Status badge components for feature lifecycle states.

- **Path**: `common/feature-status-badges/`

### FeatureStatusConfig

Configuration mapping feature states to colors and labels.

- **Path**: `common/feature-status-config.ts` (single file)

### FeatureStatusGroup

Grouped list of features by status in the sidebar.

- **Path**: `common/feature-status-group/`

### InlineAttachments

Inline display of attachment list.

- **Path**: `common/inline-attachments/`

### LoadingSkeleton

Content placeholder shown during loading states.

- **Path**: `common/loading-skeleton/`
- **Props**: `variant` (`text`, `card`, `list`, `page`), `lines?`, `className?`

### MergeReview

Merge review UI components.

- **Path**: `common/merge-review/`

### OpenActionMenu

Menu for opening items in IDE, shell, or browser.

- **Path**: `common/open-action-menu/`

### PageHeader

Consistent page header with title, optional description, and action slot.

- **Path**: `common/page-header/`
- **Props**: `title` (required), `description?`, `actions?` (ReactNode)

### PrdQuestionnaire

PRD (Product Requirements Document) questionnaire form.

- **Path**: `common/prd-questionnaire/`

### ProductDecisionsSummary

Summary display for product decisions.

- **Path**: `common/product-decisions-summary/`

### RejectFeedbackDialog

Dialog for providing rejection feedback.

- **Path**: `common/reject-feedback-dialog/`

### RepositoryNode

React Flow canvas node representing a repository.

- **Path**: `common/repository-node/`

### ServerLogViewer

Log viewer component for server/agent logs.

- **Path**: `common/server-log-viewer/`

### ShepLogo

Shep branding logo component.

- **Path**: `common/shep-logo/`

### SidebarCollapseToggle

Toggle button for collapsing/expanding the sidebar.

- **Path**: `common/sidebar-collapse-toggle/`

### SidebarNavItem

Navigation item for the sidebar menu.

- **Path**: `common/sidebar-nav-item/`

### SidebarSectionHeader

Section header within the sidebar.

- **Path**: `common/sidebar-section-header/`

### SoundToggle

Toggle for enabling/disabling UI notification sounds.

- **Path**: `common/sound-toggle/`

### TaskProgressView

Progress view for task/agent execution steps.

- **Path**: `common/task-progress-view/`

### TechDecisionsReview

Review UI for technical decisions.

- **Path**: `common/tech-decisions-review/`

### ThemeToggle

Toggle between light, dark, and system theme modes.

- **Path**: `common/theme-toggle/`
- **Uses**: `useTheme` hook, Button (ghost variant), Lucide icons (Sun/Moon)

### VersionBadge

Badge displaying the current version.

- **Path**: `common/version-badge/`

## Tier 2: Layout Components (`components/layouts/`)

Page shells and structural wrappers. Each in its own subfolder with stories and barrel export.

### AppShell

Top-level application wrapper integrating sidebar and main content area.

- **Path**: `layouts/app-shell/`
- **Props**: `children` (page content)

### AppSidebar

Application sidebar with feature list, navigation, and status groups.

- **Path**: `layouts/app-sidebar/`
- **Uses**: SidebarNavItem, FeatureStatusGroup, FeatureListItem, ShepLogo, VersionBadge

### DashboardLayout

Full-page shell combining sidebar and content area with React Flow canvas.

- **Path**: `layouts/dashboard-layout/`

### Header

Top navigation bar.

- **Path**: `layouts/header/`

### Sidebar

Base sidebar layout component.

- **Path**: `layouts/sidebar/`

## Tier 3: Feature Components (`components/features/`)

Domain-specific UI components organized by bounded context.

### control-center/

Main control center orchestrating the dashboard view.

- **ControlCenter** (`control-center.tsx`) -- Top-level control center component
- **ControlCenterInner** (`control-center-inner.tsx`) -- Inner component wiring callbacks and state
- **ControlCenterEmptyState** (`control-center-empty-state.tsx`) -- Empty state when no features exist
- **useControlCenterState** (`use-control-center-state.ts`) -- Hook managing graph state, server actions, and SSE events

### features-canvas/

React Flow canvas for visualizing features and repositories.

- **FeaturesCanvas** (`features-canvas.tsx`) -- React Flow canvas rendering feature and repository nodes
- **DependencyEdge** (`dependency-edge.tsx`) -- Custom edge component for feature dependencies

### settings/

Settings page sections.

- **SettingsPageClient** (`settings-page-client.tsx`) -- Client-side settings page
- **AgentSettingsSection** (`agent-settings-section.tsx`) -- Agent configuration section
- **DatabaseSettingsSection** (`database-settings-section.tsx`) -- Database info section
- **EnvironmentSettingsSection** (`environment-settings-section.tsx`) -- Environment settings
- **NotificationSettingsSection** (`notification-settings-section.tsx`) -- Notification preferences
- **WorkflowSettingsSection** (`workflow-settings-section.tsx`) -- Workflow defaults
- **AgentModelPicker** (`AgentModelPicker/`) -- Agent and model picker component
- **ModelPicker** (`ModelPicker/`) -- LLM model picker component

### skills/

Skills page components.

- **SkillsPageClient** (`skills-page-client.tsx`) -- Skills listing page
- **SkillList** (`skill-list.tsx`) -- List of available skills
- **SkillCard** (`skill-card.tsx`) -- Individual skill card
- **SkillDetailDrawer** (`skill-detail-drawer.tsx`) -- Skill detail drawer
- **CategoryFilter** (`category-filter.tsx`) -- Category filter for skills

### tools/

Tools page components.

- **ToolsPageClient** (`tools-page-client.tsx`) -- Tools listing page
- **ToolCard** (`tool-card.tsx`) -- Individual tool card with install status
- **ToolDetailDrawer** (`tool-detail-drawer.tsx`) -- Tool detail drawer

### version/

- **VersionPageClient** (`version/version-page-client.tsx`) -- Client-side version display page

## Storybook

View all components with interactive examples:

```bash
pnpm dev:storybook
```

Opens at http://localhost:6006 with:

- All component variants with interactive controls
- Accessibility testing (a11y addon)
- Responsive viewport testing
- Design system documentation (Colors, Typography, Getting Started)
