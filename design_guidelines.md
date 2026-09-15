# GymDesk - Gym Management System Design Guidelines

## Design Approach
**System**: Material Design adapted for data-heavy dashboard application  
**Rationale**: Utility-focused gym management tool requiring efficiency, clear information hierarchy, and professional reliability. The application prioritizes functionality and rapid data access over visual experimentation.

---

## Typography System

**Primary Font**: Inter (Google Fonts)
- Heading 1: 2xl, font-semibold (Dashboard titles)
- Heading 2: xl, font-semibold (Section headers, card titles)
- Heading 3: lg, font-medium (Table headers, form labels)
- Body: base, font-normal (Table data, form inputs)
- Small: sm, font-normal (Metadata, timestamps, helper text)
- Stats/Numbers: 3xl, font-bold (Dashboard metrics)

---

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-6
- Card spacing: p-4 or p-6
- Section gaps: gap-6
- Input spacing: p-3
- Button padding: px-6 py-3

**Grid Structure**:
- Sidebar: Fixed width 256px (w-64)
- Main content: flex-1 with max-w-7xl container
- Dashboard stats: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6
- Two-column forms: grid-cols-1 md:grid-cols-2 gap-4

---

## Core Components

### Navigation Sidebar
- Fixed left sidebar, full height
- Logo at top (p-6)
- Navigation items with icons (px-4 py-3, gap-3)
- Active state indication with distinct treatment
- Logout button at bottom

### Dashboard Cards
- Rounded corners (rounded-lg)
- Elevation with shadow-md
- Icon + Label + Large Number layout
- Consistent internal padding (p-6)
- Minimum height for visual balance

### Data Tables
- Full-width with border
- Header row with font-medium
- Alternating row treatment for readability
- Action buttons (View/Edit/Delete) right-aligned
- Padding: px-4 py-3 for cells
- Status badges with rounded-full pills

### Forms
- Grouped sections with labels above inputs
- Input fields: rounded-md, border, px-3 py-2
- Consistent height (h-10 or h-11)
- Search/filter bars at top with icon integration
- Action buttons grouped at bottom-right

### Attendance Pad
- Grid layout: grid-cols-3 gap-4 for number pad
- Large touch-friendly buttons (h-16 text-2xl)
- Display field at top showing entered number
- Clear/Submit actions below pad

### Buttons
- Primary: px-6 py-3, rounded-md, font-medium
- Secondary: Border variant with transparent fill
- Icon buttons: Square (h-10 w-10), rounded-md
- Destructive actions: Distinct treatment

---

## Page Layouts

### Dashboard
Four metric cards in responsive grid, followed by quick actions/recent activity section

### List Views (Students, Payment History, Attendance)
- Page header with title + Add New button
- Search/filter bar
- Data table below
- Pagination controls at bottom

### Registration/Payment Forms
Two-column responsive form with left-aligned labels, right-aligned submit button

### Income Dashboard
- Summary cards at top (2-column grid)
- Charts/graphs in cards below
- Monthly breakdown table

---

## Icons
**Library**: Heroicons (CDN)
- Navigation: outline style, 24px
- Dashboard cards: outline style, 32px
- Table actions: solid style, 20px
- Form fields: outline style, 20px

---

## Interactions

**Minimal Animations**:
- Sidebar hover: Subtle shift
- Button hover: Slight opacity change
- Card hover: Shadow elevation increase
- No scroll animations or complex transitions

**Focus States**: 
- Clear ring indicator on all interactive elements
- Keyboard navigation fully supported

---

## Images
**No hero images required** - This is a functional dashboard application focused on data management and operations, not marketing or brand presentation.

---

## Accessibility
- All form inputs with associated labels
- ARIA labels on icon-only buttons
- Sufficient contrast ratios throughout
- Keyboard navigation for all interactive elements
- Focus indicators on all focusable elements