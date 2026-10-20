# CoolKidLabs – Site Redesign Task List

---

## Content Changes

- [ ] Remove the tagline *"ran by Ziony-Cool to aid you with your projects from a character sheet generator to an AI text grappler... CoolKidLabs got you covered."* from the homepage and move it to the **About Us** page
- [ ] Create an **About Us** page
- [ ] Replace the "Support me on Ko-fi" button with a **"Support Me"** link pointing to a dedicated support page

---

## Layout Redesign

### 1. Tool Button Styling
Redesign all tool buttons to use oval, circular, or rounded-rectangle shapes (consistent curved edges throughout).

### 2. Button Arrangement — V-Shape Grid
Arrange buttons in a repeating V-shaped pattern with breathing room on both sides:
- **Top row:** 3 buttons
- **Middle row:** 2 buttons
- *(Repeat pattern)*

### 3. Sidebar Hover Tooltips
Use the empty side space created by the V-layout to trigger contextual panels on hover:
- Delay: **450ms**
- On trigger: slide out a dialogue panel showing a **description** of the tool on one side and a **demo image** on the other

### 4. Button Micro-Interactions & WiFi Indicator
- Buttons slightly **scale up** on hover to feel interactive
- Sprinkle decorative **SVG accents** around select buttons
- Add a **WiFi signal SVG icon** (animated bars) that uses JS to read connection strength and display a status indicator to the user

### 5. Visual Theme — Neon Mystical
Go for a dark, neon-mystical aesthetic:
- **Palette:** Deep purple, cyan, black, neon green
- **Background:** Scattered mini star field

### 6. Logo Placement
- Position the **CoolKidLabs logo** in the **top-right corner**
- Logotype styling: **cyan-to-purple** gradient text

### 7. Star Field Animation
- Stars slowly **drift downward** and **fade out** near the bottom
- The bottom of the page should be the **darkest zone** so stars dissolve naturally into it

---

## Out of Scope (Next Phase)
- Individual tool builds — deferred to later sprints