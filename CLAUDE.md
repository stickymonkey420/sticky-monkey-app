@AGENTS.md

# App UI rules

- **Popups close only by a button.** Modals/popup forms must NOT close when
  the user taps or clicks outside them (no backdrop onClick/onMouseDown
  close handlers). Every popup must have a visible Close (×) and/or Cancel
  button. Escape-key close is fine. Dropdown menus and the mobile nav
  drawer are not popups and may still close on outside tap.
