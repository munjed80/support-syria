# Municipal Requests System (نظام الطلبات البلدية)

A complete municipal service requests (complaints) management system enabling citizens to submit and track service requests while empowering district and municipal administrations to efficiently manage and resolve community issues.

**Experience Qualities**:
1. **Accessible** - Citizens can submit and track requests without creating accounts, lowering barriers to civic participation
2. **Organized** - Clear role-based workflows ensure requests flow efficiently from submission through assignment to resolution
3. **Transparent** - Real-time status tracking and public timelines build trust between citizens and government

**Complexity Level**: Complex Application (advanced functionality, likely with multiple views)
This is a multi-role system with distinct dashboards for citizens, district staff, and municipal administrators, featuring role-based access control, audit logging, SLA tracking, and comprehensive reporting capabilities.

## Essential Features

### Citizen Request Submission (No Login Required)
- **Functionality**: Anonymous form allowing citizens to report municipal service issues
- **Purpose**: Remove barriers to civic engagement and complaint reporting
- **Trigger**: Citizen clicks "تقديم طلب جديد" (Submit New Request) button
- **Progression**: Select category → Choose district → Enter description → Optional photo upload → Optional location (map/address) → Review → Submit → Receive tracking code
- **Success criteria**: Request saved to database, unique tracking code generated, confirmation page displays with tracking code and QR code

### Request Tracking Portal
- **Functionality**: Public lookup system using tracking codes
- **Purpose**: Provide transparency and reduce follow-up calls to municipal offices
- **Trigger**: Citizen enters tracking code in search field
- **Progression**: Enter tracking code → View request details → See current status → Review public timeline → Optionally add one update with photo
- **Success criteria**: Request details display accurately, status updates show in chronological order, internal notes remain hidden

### District Admin Dashboard
- **Functionality**: Centralized interface for managing requests within a specific district
- **Purpose**: Enable efficient triage, assignment, and resolution of district-level issues
- **Trigger**: District admin logs in with credentials
- **Progression**: View inbox → Filter by status/category/priority → Click request → Review details → Assign to staff or change status → Add internal notes → Save
- **Success criteria**: Only district-scoped requests visible, assignments persist, status transitions validated, audit trail captured

### Staff Work Queue
- **Functionality**: Task list showing requests assigned to the logged-in staff member
- **Purpose**: Provide field workers with clear actionable items
- **Trigger**: Staff member logs in
- **Progression**: View "My Assignments" → Select request → Update status → Upload completion photo → Add notes → Mark as complete
- **Success criteria**: Only assigned requests visible, status updates require appropriate evidence (photos for completion), changes reflected immediately

### Municipal Admin Dashboard
- **Functionality**: Executive overview with municipality-wide KPIs and performance metrics
- **Purpose**: Enable data-driven decision making and identify systemic issues or high-performing districts
- **Trigger**: Municipal admin logs in
- **Progression**: View dashboard → Review KPIs → Analyze district performance table → Filter overdue/urgent requests → Export report by date range
- **Success criteria**: Accurate aggregate statistics, drill-down capability to district level, exportable reports (CSV/PDF)

### Status Management with Business Rules
- **Functionality**: Enforced workflow preventing invalid state transitions
- **Purpose**: Maintain data integrity and ensure proper documentation
- **Trigger**: User attempts to change request status
- **Progression**: Select new status → System validates transition → If REJECTED, require reason → If COMPLETED, require "after" photo → Confirm → Update saved
- **Success criteria**: Invalid transitions blocked, required fields enforced, audit log entry created

### Priority Management
- **Functionality**: Dynamic priority assignment and tracking with visual indicators and automatic escalation based on request age
- **Purpose**: Enable efficient resource allocation, highlight urgent issues requiring immediate attention, and ensure older requests don't languish without proper escalation
- **Trigger**: District/Municipal admin changes priority level OR automatic escalation based on configurable time thresholds
- **Progression**: View request → Select priority (LOW/NORMAL/HIGH/URGENT) → Confirm → System updates request and records change in timeline → Dashboard reflects new priority order | Automatic escalation: System checks all open requests every minute → If request age exceeds threshold → Automatically escalate priority → Record auto-escalation in timeline with reason
- **Success criteria**: Priority changes persist, URGENT requests always sort first, visual highlighting in all dashboards (red border for auto-escalated urgent), priority filter works, changes logged in audit trail with clear distinction between manual and automatic escalations, escalation rules are configurable via constants (LOW→NORMAL after 48h, NORMAL→HIGH after 72h, HIGH→URGENT after 48h), admins can see "تلقائي" badge on auto-escalated requests

### Automatic Priority Escalation
- **Functionality**: Background process that automatically escalates request priority based on age, category type, and configurable time thresholds specific to each category
- **Purpose**: Ensure older service requests receive increased attention based on their urgency category, with critical services (water, waste) escalating faster than routine services (roads, lighting)
- **Trigger**: Automatic check runs every 60 seconds on all open requests
- **Progression**: System evaluates all non-closed requests → Calculates time since creation or last escalation → Compares against category-specific escalation thresholds → Escalates priority if threshold exceeded → Records escalation in timeline with Arabic message showing hours passed and category information → Updates request with auto-escalation flag → Visual indicators appear in dashboards
- **Success criteria**: Escalations occur automatically without admin intervention, escalation rules configurable via CATEGORY_ESCALATION_RULES constant per category (Water: LOW 12h, NORMAL 12h, HIGH 6h; Waste: LOW 24h, NORMAL 24h, HIGH 12h; Lighting: LOW 48h, NORMAL 72h, HIGH 48h; Roads: LOW 72h, NORMAL 120h, HIGH 72h; Other: LOW 48h, NORMAL 72h, HIGH 48h), auto-escalated requests show "ترقية تلقائية" badge, timeline entries clearly indicate automatic vs manual changes with "النظام الآلي" attribution and category-specific explanation, admins can manually override auto-escalated priorities (which resets escalation timer), urgent auto-escalated requests have distinct visual highlight (red left border)

### SLA Tracking and Overdue Alerts
- **Functionality**: Automatic calculation of request age against category-based SLA targets
- **Purpose**: Highlight performance gaps and prevent requests from languishing
- **Trigger**: Background process runs on schedule
- **Progression**: Calculate elapsed time → Compare to category SLA → Flag overdue requests → Highlight in dashboards → Escalate to municipal admin view
- **Success criteria**: Overdue requests visibly flagged, accurate time calculations, filtering by overdue status works

## Edge Case Handling

**Invalid Tracking Code** - Display clear Arabic error message "رمز التتبع غير موجود" with suggestion to double-check the code
**Duplicate Submissions** - Rate limit by IP address (max 3 submissions per hour) to prevent spam
**Missing District Data** - Gracefully handle empty district lists with admin alert
**Large File Uploads** - Client-side validation for max 5MB, server rejection with user-friendly error
**Concurrent Status Updates** - Optimistic locking to prevent conflicting simultaneous edits
**Network Failures During Submit** - Auto-save draft to localStorage, allow resume on reconnect
**Role Escalation Attempts** - Backend validates all permissions, logs suspicious access attempts to audit log
**Expired Sessions** - Redirect to login with message preserving intended destination

## Design Direction

The design should evoke **governmental authority with modern accessibility**. This is a public service platform that must feel official and trustworthy while remaining approachable for all citizens regardless of technical literacy. The aesthetic should balance formality with warmth, using civic design patterns that citizens recognize from other government services while introducing contemporary UI conveniences.

## Color Selection

A civic palette inspired by traditional Middle Eastern municipal architecture - desert stone neutrals punctuated by authoritative blues and status-coded accents.

- **Primary Color**: Deep governmental blue `oklch(0.35 0.08 250)` - Communicates authority, trust, and official status
- **Secondary Colors**: 
  - Warm stone `oklch(0.92 0.015 60)` for backgrounds - Creates a approachable, neutral foundation
  - Soft teal `oklch(0.65 0.06 200)` for secondary actions - Provides visual breathing room
- **Accent Color**: Amber alert `oklch(0.70 0.15 65)` - Draws attention to urgent/overdue items and CTAs
- **Status Colors**:
  - Submitted: Gray `oklch(0.60 0.01 240)`
  - Received: Blue `oklch(0.55 0.10 250)`
  - In Progress: Amber `oklch(0.65 0.13 65)`
  - Completed: Green `oklch(0.60 0.15 145)`
  - Rejected: Red `oklch(0.55 0.18 25)`
- **Foreground/Background Pairings**:
  - Primary Blue: White text `oklch(0.99 0 0)` - Ratio 8.2:1 ✓
  - Accent Amber: Dark brown text `oklch(0.25 0.05 60)` - Ratio 5.8:1 ✓
  - Background Stone: Dark gray text `oklch(0.25 0.01 240)` - Ratio 12.1:1 ✓
  - Status badges: White text on all status colors validated at >4.5:1

## Font Selection

Typography must serve Arabic script beautifully while maintaining exceptional readability for citizens of all ages, including those with limited literacy or visual impairments.

- **Primary Font**: Cairo (Google Fonts) - A modern Arabic typeface designed specifically for UI, with excellent on-screen clarity and professional appearance
- **Secondary Font**: Tajawal (Google Fonts) - Used for body text and descriptions, offering warmth and readability in long-form Arabic content

**Typographic Hierarchy**:
- H1 (Page Titles): Cairo Bold / 32px / -0.02em letter spacing / line-height 1.2
- H2 (Section Headers): Cairo SemiBold / 24px / -0.01em / line-height 1.3
- H3 (Card Titles): Cairo Medium / 18px / 0 / line-height 1.4
- Body (Descriptions): Tajawal Regular / 16px / 0.01em / line-height 1.6
- Small (Metadata): Tajawal Regular / 14px / 0 / line-height 1.5
- Button Text: Cairo SemiBold / 15px / 0 / line-height 1

## Animations

Animations should feel efficient and governmental - purposeful rather than playful, with smooth state transitions that reassure users their actions are being processed.

- **Status transitions**: 300ms ease-in-out color fade communicating state changes
- **Form submissions**: Loading indicator with subtle pulse to confirm processing
- **Dashboard updates**: Gentle 200ms slide-in for new items in lists
- **Success confirmations**: Celebratory 400ms scale + fade for completed requests
- **Filter applications**: 150ms opacity transition to avoid jarring content swaps
- **Hover states**: Immediate (0ms) for responsiveness, subtle lift (2px) on interactive cards

## Component Selection

**Components**:
- **Card** - Primary container for requests, dashboard KPIs, and district summaries (add shadow-md for elevation)
- **Badge** - Status indicators with color-coded backgrounds matching status palette
- **Button** - Primary actions use filled style, secondary use outline variant
- **Select** - Dropdown for category, district, and status filters (RTL-aware)
- **Textarea** - Multi-line input for descriptions and notes
- **Input** - Single-line fields for tracking codes and search
- **Dialog** - Modal for request details, confirmations, and photo previews
- **Table** - District performance metrics and request lists with sortable columns
- **Tabs** - Switch between "جميع الطلبات" (All Requests) and "طلباتي" (My Assignments)
- **Alert** - System messages, validation errors, and success confirmations
- **Progress** - Visual indicator for form completion and SLA time remaining
- **Separator** - Visual breaks between timeline entries
- **Avatar** - User identification for staff assignments and audit logs
- **Popover** - Contextual actions menu on request cards

**Customizations**:
- Custom `RequestTimeline` component using vertical line connector pattern
- Custom `FileUpload` component with drag-drop and Arabic instructions
- Custom `TrackingCodeDisplay` component with copy-to-clipboard and QR code generation
- Custom `DistrictMap` component for location selection (if map library available)

**States**:
- Buttons: Default → Hover (opacity-90) → Active (scale-95) → Disabled (opacity-50, cursor-not-allowed)
- Inputs: Default border → Focus (ring-2 ring-primary) → Error (border-destructive ring-destructive) → Success (border-green-500)
- Cards: Default → Hover (shadow-lg transition) → Selected (border-primary border-2)
- Status badges: Static appearance, no hover states (informational only)

**Icon Selection**:
- Submit: PaperPlaneRight
- Track: MagnifyingGlass
- Status: CircleNotch (submitted), CheckCircle (completed), XCircle (rejected), Clock (in-progress)
- Location: MapPin
- Upload: UploadSimple
- User: User
- Dashboard: ChartBar
- Districts: Buildings
- Priority: Warning (high), Info (normal)

**Spacing**:
- Container padding: px-6 py-8 (desktop), px-4 py-6 (mobile)
- Card internal padding: p-6 (desktop), p-4 (mobile)
- Section gaps: space-y-6
- Form field gaps: space-y-4
- Button groups: gap-3
- Grid gaps: gap-4 (cards), gap-6 (dashboard)

**Mobile**:
- Stack dashboard KPI cards vertically with space-y-4
- Convert table to card list on mobile (<768px)
- Full-width buttons on mobile
- Bottom-fixed CTA for submit form on mobile
- Collapsible filters using Accordion on mobile
- Simplified navigation with hamburger menu
