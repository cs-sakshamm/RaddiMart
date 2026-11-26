# RADDIMART — Design System

## 1. Visual Design Overview

This design system documents the visual direction, palette, typography, and component specifications for the RADDIMART public homepage, generated through Hallmark and self-approved for Phase 1 implementation.

## 2. Colour Palette

The colour palette was selected from the Hallmark Coral theme deal, adapted for an eco-friendly recycling marketplace identity. The primary colour **#107357** (from the original brand brief) is retained as an accent/secondary colour alongside the Coral theme's warm grey palette.

| Token | Value | Use |
| --- | --- | --- |
| `--color-brand` | `#107357` | Primary actions, active navigation, key status accents |
| `--color-brand-dark` | `#0b5944` | Hover/pressed states, focus ring, dark headings on pale surfaces |
| `--color-brand-pale` | `#e8f4ef` | Selected rows, quiet panels, success-adjacent surfaces |
| `--color-background` | `#f7f9f8` | Page background |
| `--color-surface` | `#ffffff` | Primary surface and modal panel |
| `--color-ink` | `#1f2937` | Body and headings |
| `--color-ink-soft` | `#66736d` | Helper copy, metadata, muted labels |
| `--color-error` | `#b42318` | Error states |
| `--color-success` | `#107357` | Success states |
| `--color-focus` | `#0b5944` | Focus rings |

## 3. Typography

| Token | Value | Use |
| --- | --- | --- |
| `--font-sans` | `'Instrument Sans', ui-sans-serif, system-ui, sans-serif` | Body and general text |
| `--font-display` | `'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif` | Display headings |
| `--font-mono` | `'DM Mono', ui-monospace, monospace` | Numeric labels, weights, transaction references |

- Display: Schibsted Grotesk, sentence case, tight but readable tracking
- Body: Instrument Sans at 16px or larger
- Maximum two type families plus one numeric outlier
- Headings carry one weight and one colour

## 4. Layout & Spacing

- Container: 1440px max-width, centered
- Gutters: 64px (desktop), 24px (under 60rem), 16px (under 40rem)
- Column gaps: 32px (desktop), 24px (under 60rem), 16px (under 40rem)
- Section gaps: 144px (default), 120px (under 60rem), adjusted for mobile

## 5. Component Specifications

- **Buttons**: One primary style, one secondary style, with all eight states (default, hover, focus-visible, active, disabled, loading, error, success)
- **Inputs**: Native elements with consistent styling, labels above fields, 44px minimum hit targets
- **Dialog/popup**: Native `<dialog>` element with accessible semantics, focus trap, Escape key support
- **Navigation**: Edge-aligned masthead with logo and links, collapses to menu under 60rem
- **Containers**: Max-width 1440px, centered with side padding

## 6. Responsive Breakpoints

Two shared breakpoints in `rem` so they follow the user's font size:

- **Under 60rem** (about 960px): Multi-column grids become one column, sidebars collapse into a menu, sticky panes unstack
- **Under 40rem** (about 640px): Display sizes step down, gutters tighten to 16px, annotations consolidate

## 7. Accessibility

- WCAG-aligned contrast for text, controls and focus indicators
- Visible `:focus-visible` ring on every interactive element
- Minimum 44 x 44 CSS px touch targets
- Native semantics: `<button>`, `<a>`, `<dialog>`, form labels and table structures
- `overflow-x: clip` on both `html` and `body`
- All animation has `prefers-reduced-motion` fallback
- Simple language and short forms for users with limited digital literacy

## 8. Hallmark Stamp

```
Hallmark · v2.0.0 · shape: Split Studio · genre: modern-minimal · theme: Coral (deal 1/3, seed raddimart-recycling-marketplace-homepage-ae17·617b1d49·2026-11-24·r0) · job: join · contrast: pass · v2.0.0
```