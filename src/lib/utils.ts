import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The shared type scale (text-label ... text-display) is defined in globals.css.
// Teach tailwind-merge that these are font sizes, not colours.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "label",
        "caption",
        "small",
        "body",
        "lead",
        "h3",
        "h2",
        "h1",
        "display",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
