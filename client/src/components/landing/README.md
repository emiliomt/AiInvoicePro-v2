# Anzu Dynamics Landing Page Components

This directory contains all the components for the Anzu Dynamics landing page.

## Components

- **Header.tsx** - Fixed header with navigation and CTA buttons
- **Hero.tsx** - Main hero section with headline, description, and stats
- **Features.tsx** - Features grid showcasing key capabilities
- **HowItWorks.tsx** - Step-by-step process explanation
- **Stats.tsx** - Statistics section with key metrics
- **CTA.tsx** - Call-to-action section
- **Footer.tsx** - Footer with links and social media
- **LogoIcon.tsx** - Logo component with placeholder SVG
- **LoadingSpinner.tsx** - Loading spinner component
- **LoadingProgress.tsx** - Progress bar component

## Usage

The landing page is automatically rendered when users visit the root path (`/`) and are not authenticated. See `client/src/pages/Landing.tsx` for the main landing page implementation.

## Dependencies

All required dependencies are already installed in the project:
- `framer-motion` - For animations
- `lucide-react` - For icons
- `@/components/ui/button` - Button component
- `@/components/ui/card` - Card components

## Logo Setup

To add your logo:
1. Add `anzu-logo.png` to `client/src/assets/`
2. Uncomment the import and usage in `LogoIcon.tsx`

The component currently uses a placeholder SVG logo with a phoenix/fire design.

## Styling

All components use Tailwind CSS classes and the project's design system (CSS variables defined in `client/src/index.css`).

