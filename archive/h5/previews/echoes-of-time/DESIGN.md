---
name: Echoes of Time
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbd9d9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#eae8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#414844'
  inverse-surface: '#303030'
  inverse-on-surface: '#f2f0f0'
  outline: '#717974'
  outline-variant: '#c1c8c3'
  surface-tint: '#416657'
  primary: '#153b2e'
  on-primary: '#ffffff'
  primary-container: '#2d5244'
  on-primary-container: '#9cc4b2'
  inverse-primary: '#a7cfbd'
  secondary: '#944924'
  on-secondary: '#ffffff'
  secondary-container: '#fe9e71'
  on-secondary-container: '#77330f'
  tertiary: '#35352f'
  on-tertiary: '#ffffff'
  tertiary-container: '#4c4b45'
  on-tertiary-container: '#bdbbb3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c2ecd9'
  primary-fixed-dim: '#a7cfbd'
  on-primary-fixed: '#002116'
  on-primary-fixed-variant: '#294e40'
  secondary-fixed: '#ffdbcc'
  secondary-fixed-dim: '#ffb695'
  on-secondary-fixed: '#351000'
  on-secondary-fixed-variant: '#76330e'
  tertiary-fixed: '#e5e2da'
  tertiary-fixed-dim: '#c9c6be'
  on-tertiary-fixed: '#1c1c17'
  on-tertiary-fixed-variant: '#474741'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e2'
typography:
  headline-lg:
    fontFamily: Noto Serif
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Noto Serif
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 34px
  headline-sm:
    fontFamily: Noto Serif
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 30px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  label-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Noto Serif
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The brand personality is reflective, nostalgic, and deeply humanistic. It serves as a sanctuary for personal expression, targeting individuals who value storytelling, legacy, and emotional recording. The UI should evoke a sense of "quiet warmth"—like reading an old letter in a sunlit room.

The design style is a blend of **Minimalism** and **Tactile Modernism**. It avoids the sterility of pure tech by utilizing paper-like textures, organic color palettes, and literary typography. The interface prioritizes readability and emotional resonance, using generous whitespace and soft transitions to create a focused, meditative writing and listening environment.

## Colors

The palette is rooted in nature and heritage.
- **Primary (Forest Green):** Used for key actions, brand identity, and structural elements. It conveys stability and growth.
- **Secondary (Ochre/Sienna):** Used for accents, highlights, and status indicators. It provides a warm, nostalgic contrast.
- **Background (Parchment):** A warm, off-white/beige base that reduces eye strain and mimics high-quality paper.
- **Neutral (Charcoal):** Used for secondary text and borders to maintain high legibility without the harshness of pure black.

Functional colors (Success/Error) should be desaturated to fit the earthy tone of the overall palette.

## Typography

This design system uses a dual-font approach to balance literary tradition with digital clarity.

**Noto Serif** is used for all display headings and title cards. It provides the "voice" of the author, lending authority and a timeless, book-like quality to the content.

**Manrope** is used for body text, interface labels, and inputs. Its clean, geometric construction ensures maximum legibility during long-form writing or reading sessions.

Line heights are intentionally generous (1.5x - 1.6x) to create a relaxed reading rhythm and prevent visual crowding.

## Layout & Spacing

The layout follows a **fluid grid** model with restricted maximum widths for content blocks to ensure optimal line lengths for reading.

- **Mobile:** Single column with 20px - 24px side margins.
- **Desktop:** Centered content containers (max-width 800px for writing/reading) to maintain focus.

Spacing is used to group related thoughts. Large vertical gaps (32px+) are encouraged between different sections or "chapters" of the UI to allow the design to breathe. Gutters should be consistent to maintain a clean vertical rhythm.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Ambient Shadows**.

- **Level 0 (Base):** The Parchment background (#F4F1E8).
- **Level 1 (Cards):** Pure white (#FFFFFF) surfaces with very soft, diffused shadows (Blur: 20px, Opacity: 4%, Color: Primary). This creates a "lifted paper" effect rather than a digital box.
- **Level 2 (Modals/Popovers):** Higher elevation with a slight backdrop blur (8px) to maintain the relationship with the underlying content while signaling a temporary state change.

Avoid harsh borders. Instead, use subtle value shifts or the secondary accent color to define boundaries.

## Shapes

The shape language is consistently **Rounded**, reflecting the soft and approachable nature of the brand.

- Standard cards and input fields use a 16px (1rem) radius.
- Buttons and selection chips use a fully rounded "pill" shape to signify interactivity.
- Image containers and story thumbnails use the standard 16px radius to maintain a unified aesthetic.

These curves help soften the interface, making it feel organic and safe for personal reflection.

## Components

### Buttons
- **Primary:** Solid Forest Green with white Manrope text. Pill-shaped.
- **Secondary:** Outlined in Forest Green or Ochre.
- **Ghost:** Text-only for low-priority actions like "Cancel" or "Skip."

### Cards
Cards are the primary vehicle for stories. They must feature white backgrounds, soft shadows, and generous internal padding (24px). Titles within cards should always use Noto Serif.

### Audio Player / Input
The audio recording interface uses the Forest Green as its base. Waveforms should be rendered in the Secondary Ochre color to provide a visual heartbeat to the sound.

### Text Inputs
Inputs should feel like a clean sheet of paper. Use a bottom-border only or a very light outline. Focus states should transition the border to the Primary color with a subtle inner glow.

### Illustration Style
Use "Story-style" illustrations—hand-drawn textures, organic lines, and a limited palette derived from the primary/secondary colors. Illustrations should be used as emotional anchors for empty states or header backgrounds.
