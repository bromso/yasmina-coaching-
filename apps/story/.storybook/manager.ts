import { addons } from "storybook/manager-api"
import { lightTheme } from "./theme"

/**
 * Configure the Storybook manager (UI chrome).
 *
 * This applies custom theming to:
 * - Sidebar
 * - Toolbar
 * - Panel tabs
 * - Search
 *
 * Note: To enable automatic dark mode syncing with the OS preference,
 * you can use CSS media queries in a manager-head.html file,
 * or implement a custom addon.
 */
addons.setConfig({
  theme: lightTheme,

  // Sidebar configuration
  sidebar: {
    // Show story names in sidebar (not just component names)
    showRoots: true,
    // Collapse all folders by default (cleaner UI)
    collapsedRoots: ["other"],
  },

  // Toolbar configuration
  toolbar: {
    // Show/hide specific toolbar items
    title: { hidden: false },
    zoom: { hidden: false },
    eject: { hidden: false },
    copy: { hidden: false },
    fullscreen: { hidden: false },
  },

  // Initial UI state
  enableShortcuts: true,
  showToolbar: true,
  selectedPanel: "addon-controls",
  panelPosition: "bottom",
})
